import { Prisma } from "@prisma/client";
import { CENTER_INFO } from "@/lib/center";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import { periodIndex } from "@/lib/enrollment-period";
import { prisma } from "@/lib/prisma";
import {
  cutoffResolver,
  withPayoutDates,
  DEFAULT_SALARY_CUTOFF,
  parseSalaryCutoff,
  SALARY_CUTOFF_SETTING_KEY,
  salaryIndexForPayment,
  type SalaryCutoff
} from "@/lib/salary-cutoff";

/**
 * Lương giáo viên theo THÁNG LƯƠNG có ngày chốt (xem salary-cutoff.ts; tháng nào trả lương khác
 * ngày thường lệ thì có thể đặt riêng ngày chốt cho tháng đó — SalaryMonthCutoff):
 *   lương tháng T = % chia × (học phí kỳ T nộp đến hết ngày chốt tháng T
 *                             + học phí các kỳ trước nộp muộn, sau ngày chốt của kỳ đó).
 * Học sinh nộp sau ngày chốt được ghi chú ở cả hai nơi: "nộp sau ngày chốt → lương tháng sau"
 * ở tháng cũ và "nộp muộn tháng trước tính vào đây" ở tháng mới.
 * Mỗi lần chuyển tiền cho giáo viên là một bản ghi chi phí của tháng lương đó (trả một phần,
 * chuyển thêm, hoặc số âm khi trừ lại phần chuyển dư). Còn nợ = phải trả − tổng đã chuyển.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type SalaryRecord = {
  id: string;
  amount: number;
  sharePercent: number | null;
  baseAmount: number | null;
  description: string;
  note: string | null;
  /** Ngày chuyển tiền thực tế (bản ghi cũ: ngày ghi). */
  paidAt: Date | null;
  /** Chuyển khoản hoặc tiền mặt (cột "Chuyển thêm" trong sổ tay); null = bản ghi cũ. */
  paymentMethod: "bank_transfer" | "cash" | null;
  createdAt: Date;
};

export type SalaryComputation = {
  /** percent: tính theo % học phí; manual: tháng có bản ghi lương nhập tay, không tự đối chiếu. */
  mode: "percent" | "manual";
  sharePercent: number;
  due: number;
  /** Tổng đã chuyển cho giáo viên của tháng lương. */
  paidOut: number;
  /** Phải trả − đã chuyển: dương = còn nợ giáo viên, âm = đã chuyển dư. */
  difference: number;
};

/**
 * Tỷ lệ % được khóa theo lần chuyển lương đầu tiên của tháng (đổi % của lớp sau đó không làm đổi
 * lương các tháng đã chuyển); tháng chưa chuyển dùng % hiện tại của lớp.
 */
export function computeSalary(input: {
  collected: number;
  classSharePercent: number;
  records: Array<Pick<SalaryRecord, "amount" | "sharePercent" | "createdAt">>;
  /** Phần lương đã tính sẵn cộng thêm (nộp muộn tháng trước, tính theo % của tháng gốc). */
  extraShare?: number;
}): SalaryComputation {
  const records = [...input.records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const paidOut = records.reduce((sum, record) => sum + record.amount, 0);
  if (records.some((record) => record.sharePercent === null)) {
    return { mode: "manual", sharePercent: 0, due: paidOut, paidOut, difference: 0 };
  }
  const sharePercent = records[0]?.sharePercent ?? input.classSharePercent;
  const due = Math.round((input.collected * sharePercent) / 100) + (input.extraShare ?? 0);
  return { mode: "percent", sharePercent, due, paidOut, difference: due - paidOut };
}

export type SalaryStatus = {
  key: "manual" | "unpaid" | "partial" | "advance" | "over" | "waiting" | "done" | "empty" | "writtenOff";
  label: string;
  tone: "success" | "warning" | "primary" | "neutral";
};

/**
 * `waitingCount/waitingShare`: học sinh chưa nộp mà nếu nộp sẽ còn tính vào tháng này (tức là
 * chưa qua ngày chốt); tháng đã qua ngày chốt thì truyền 0.
 */
export function salaryStatus(input: {
  mode: SalaryComputation["mode"];
  paidOut: number;
  difference: number;
  waitingCount: number;
  waitingShare: number;
}): SalaryStatus {
  if (input.mode === "manual") return { key: "manual", label: "Nhập tay", tone: "neutral" };
  if (input.difference > 0) {
    return input.paidOut === 0
      ? { key: "unpaid", label: "Chưa chuyển", tone: "warning" }
      : { key: "partial", label: "Cần chuyển thêm", tone: "warning" };
  }
  if (input.difference < 0) {
    // Chuyển trước nhiều hơn số đã thu nhưng vẫn còn HS chưa nộp trong hạn: khi họ nộp sẽ tự cân lại.
    return input.waitingCount > 0 && input.waitingShare >= -input.difference
      ? { key: "advance", label: `Ứng trước · chờ ${input.waitingCount} HS nộp`, tone: "primary" }
      : { key: "over", label: "Chuyển dư", tone: "primary" };
  }
  if (input.waitingCount > 0) {
    return { key: "waiting", label: `Đủ phần đã thu · chờ ${input.waitingCount} HS`, tone: "primary" };
  }
  return input.paidOut === 0
    ? { key: "empty", label: "Chưa có thu", tone: "neutral" }
    : { key: "done", label: "TT đủ", tone: "success" };
}

export type LedgerStudent = {
  invoiceId: string;
  studentName: string;
  /** Kỳ học phí của khoản này. */
  month: number;
  year: number;
  amount: number;
  /** Phần lương giáo viên tương ứng với khoản học phí này. */
  share: number;
  paidAt: Date | null;
};

export type CarriedOutStudent = LedgerStudent & {
  salaryMonth: number;
  salaryYear: number;
  /** Đã bỏ qua cùng dư nợ của tháng gốc nên không cộng sang lương tháng sau. */
  writtenOff: boolean;
};

export type SalaryLine = SalaryComputation & {
  classId: string;
  className: string;
  shortCode: string;
  teacherName: string;
  archived: boolean;
  classSharePercent: number;
  /** Ngày chốt áp dụng cho lớp; `customCutoff` = lớp đặt riêng, không theo cài đặt chung. */
  cutoff: SalaryCutoff;
  customCutoff: boolean;
  /** Tháng lương. */
  month: number;
  year: number;
  /** Học phí tính vào lương tháng này: nộp trong hạn + nộp muộn từ các tháng trước. */
  collected: number;
  /** Phần học phí của chính tháng này nộp trong hạn (nhân với sharePercent). */
  ownCollected: number;
  cutoffDate: Date;
  /** Ngày chốt của tháng này được đặt riêng (không theo quy tắc chung). */
  cutoffOverridden: boolean;
  /** Ngày chốt lùi tới ngày chuyển lương đầu tiên vì tháng này trả lương muộn hơn ngày chốt. */
  cutoffFromPayout: boolean;
  cutoffPassed: boolean;
  /** Các lần chuyển lương của tháng, theo thứ tự ghi. */
  payouts: SalaryRecord[];
  /** Tổng trả bằng chuyển khoản / tiền mặt (hai cột "Đã chuyển" / "Chuyển thêm" của sổ tay). */
  paidBank: number;
  paidCash: number;
  /** HS các tháng trước nộp sau ngày chốt của tháng đó → tính vào lương tháng này. */
  carriedIn: LedgerStudent[];
  carriedInShare: number;
  /** HS của tháng này nộp sau ngày chốt → tính vào lương tháng sau. */
  carriedOut: CarriedOutStudent[];
  carriedOutShare: number;
  /** HS chưa nộp học phí kỳ này. */
  waiting: LedgerStudent[];
  waitingShare: number;
  /**
   * Dư nợ của tháng (cột "Dư nợ" của sổ tay) = phần nộp muộn sang tháng sau + phần chưa trả
   * (âm = trả dư). Tháng đã bỏ qua dư nợ thì đây là số đã bỏ qua.
   */
  debt: number;
  /** Tháng này đã bỏ qua dư nợ (chênh lệch đã thỏa thuận xong với giáo viên). */
  writeOff: { note: string | null; createdAt: Date } | null;
  /** Tổng tháng trước khi bỏ qua phần chưa trả (để hiển thị đúng "Tổng tháng" của sổ tay). */
  grossDue: number;
  status: SalaryStatus;
};

export type SalaryInput = {
  /** Khoảng tháng lương cần tính, tính bằng periodIndex, gồm cả hai đầu. */
  fromIndex: number;
  toIndex: number;
  now: Date;
  defaultCutoff: SalaryCutoff;
  /** Ngày chốt đặt riêng theo tháng (áp dụng cho lớp theo ngày chốt chung). */
  monthCutoffs?: Array<{ month: number; year: number; cutoffDate: Date }>;
  classes: Array<{
    id: string;
    name: string;
    shortCode: string;
    teacherName: string;
    teacherSharePercent: number;
    archivedAt: Date | null;
    salaryCutoff: string | null;
  }>;
  invoices: Array<{
    id: string;
    classId: string;
    month: number;
    year: number;
    status: "paid" | "unpaid";
    amount: number;
    paidAmount: number | null;
    paidAt: Date | null;
    studentName: string;
  }>;
  records: Array<SalaryRecord & { classId: string; month: number; year: number }>;
  writeOffs?: Array<{ classId: string; month: number; year: number; note: string | null; createdAt: Date }>;
};

const nameCollator = new Intl.Collator("vi");

/** Lúc chuyển lương đầu tiên (khoản dương) của một tháng, null nếu chưa chuyển. */
function firstPayoutAt(records: Array<Pick<SalaryRecord, "amount" | "paidAt" | "createdAt">>) {
  const times = records.filter((record) => record.amount > 0).map((record) => (record.paidAt ?? record.createdAt).getTime());
  return times.length > 0 ? new Date(Math.min(...times)) : null;
}
const byName = (a: { studentName: string }, b: { studentName: string }) =>
  nameCollator.compare(a.studentName, b.studentName);
const byPaidAt = (a: { paidAt: Date | null }, b: { paidAt: Date | null }) =>
  (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0);

type Bucket = {
  onTime: number;
  carriedIn: SalaryInput["invoices"];
  carriedOut: Array<SalaryInput["invoices"][number] & { salaryIndex: number; writtenOff: boolean }>;
  waiting: SalaryInput["invoices"];
  records: SalaryRecord[];
};

/**
 * Tính lương từng lớp cho từng tháng lương trong khoảng (hàm thuần để kiểm thử được).
 * `keepIdle`: vẫn trả dòng cho lớp đang chia % dù tháng đó chưa có gì (bảng lương ở Thu chi).
 */
export function computeSalaryLines(input: SalaryInput, options: { keepIdle?: boolean } = {}): SalaryLine[] {
  const inRange = (index: number) => index >= input.fromIndex && index <= input.toIndex;
  const invoicesByClass = new Map<string, SalaryInput["invoices"]>();
  for (const invoice of input.invoices) {
    invoicesByClass.set(invoice.classId, [...(invoicesByClass.get(invoice.classId) ?? []), invoice]);
  }
  const recordsByClass = new Map<string, SalaryInput["records"]>();
  for (const record of input.records) {
    recordsByClass.set(record.classId, [...(recordsByClass.get(record.classId) ?? []), record]);
  }

  const writeOffs = new Map(
    (input.writeOffs ?? []).map((item) => [`${item.classId}:${periodIndex(item.month, item.year)}`, item])
  );
  const monthOverrides = new Map(
    (input.monthCutoffs ?? []).map((item) => [periodIndex(item.month, item.year), item.cutoffDate])
  );
  const lines: SalaryLine[] = [];
  for (const classRoom of input.classes) {
    const custom = parseSalaryCutoff(classRoom.salaryCutoff);
    const cutoff = custom ?? input.defaultCutoff;
    const buckets = new Map<number, Bucket>();
    const bucket = (index: number) => {
      const existing = buckets.get(index);
      if (existing) return existing;
      const created: Bucket = { onTime: 0, carriedIn: [], carriedOut: [], waiting: [], records: [] };
      buckets.set(index, created);
      return created;
    };

    const recordsByIndex = new Map<number, SalaryRecord[]>();
    for (const record of recordsByClass.get(classRoom.id) ?? []) {
      const index = periodIndex(record.month, record.year);
      recordsByIndex.set(index, [...(recordsByIndex.get(index) ?? []), record]);
      if (inRange(index)) bucket(index).records.push(record);
    }
    // % của một tháng: khóa theo lần chuyển đầu tiên, chưa chuyển thì theo % hiện tại của lớp.
    // Khoản nộp muộn mang theo % của tháng học phí gốc sang tháng lương mới.
    const percentOf = (index: number) =>
      [...(recordsByIndex.get(index) ?? [])].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
        ?.sharePercent ?? classRoom.teacherSharePercent;
    // Lớp có ngày chốt riêng giữ quy tắc của lớp; các lớp còn lại theo ngày chốt chung của tháng.
    // Tháng nào chuyển lương muộn hơn ngày chốt thì ngày chốt lùi tới ngày chuyển đó.
    const resolver = withPayoutDates(
      custom ? cutoffResolver(custom) : cutoffResolver(input.defaultCutoff, monthOverrides),
      (index) => firstPayoutAt(recordsByIndex.get(index) ?? [])
    );

    for (const invoice of invoicesByClass.get(classRoom.id) ?? []) {
      const tuitionIndex = periodIndex(invoice.month, invoice.year);
      if (invoice.status === "unpaid") {
        if (inRange(tuitionIndex)) bucket(tuitionIndex).waiting.push(invoice);
        continue;
      }
      const salaryIndex = invoice.paidAt ? salaryIndexForPayment(tuitionIndex, invoice.paidAt, resolver) : tuitionIndex;
      if (salaryIndex === tuitionIndex) {
        if (inRange(salaryIndex)) bucket(salaryIndex).onTime += invoice.paidAmount ?? invoice.amount;
        continue;
      }
      // Nộp muộn của tháng đã bỏ qua dư nợ (nộp trước lúc bỏ qua) không cộng sang tháng sau.
      const writeOff = writeOffs.get(`${classRoom.id}:${tuitionIndex}`);
      const writtenOff = Boolean(writeOff && invoice.paidAt && invoice.paidAt <= writeOff.createdAt);
      if (inRange(salaryIndex) && !writtenOff) bucket(salaryIndex).carriedIn.push(invoice);
      if (inRange(tuitionIndex)) bucket(tuitionIndex).carriedOut.push({ ...invoice, salaryIndex, writtenOff });
    }

    for (let index = input.fromIndex; index <= input.toIndex; index += 1) {
      const current = buckets.get(index) ?? { onTime: 0, carriedIn: [], carriedOut: [], waiting: [], records: [] };
      const records = [...current.records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      // Lớp không chia % và chưa từng ghi lương tháng này thì không thuộc bảng lương.
      if (records.length === 0 && classRoom.teacherSharePercent === 0) continue;
      const active =
        current.onTime > 0 ||
        current.carriedIn.length > 0 ||
        current.carriedOut.length > 0 ||
        current.waiting.length > 0 ||
        records.length > 0;
      if (!active && !(options.keepIdle && !classRoom.archivedAt)) continue;

      const received = (invoice: SalaryInput["invoices"][number]) => invoice.paidAmount ?? invoice.amount;
      const toStudent = (invoice: SalaryInput["invoices"][number]): LedgerStudent => {
        const amount = invoice.status === "paid" ? received(invoice) : invoice.amount;
        return {
          invoiceId: invoice.id,
          studentName: invoice.studentName,
          month: invoice.month,
          year: invoice.year,
          amount,
          share: Math.round((amount * percentOf(periodIndex(invoice.month, invoice.year))) / 100),
          paidAt: invoice.paidAt
        };
      };
      const carriedIn = current.carriedIn.map(toStudent).sort(byPaidAt);
      const carriedInShare = carriedIn.reduce((sum, item) => sum + item.share, 0);
      const collected = current.onTime + carriedIn.reduce((sum, item) => sum + item.amount, 0);
      const computed = computeSalary({
        collected: current.onTime,
        classSharePercent: classRoom.teacherSharePercent,
        records,
        extraShare: carriedInShare
      });

      const carriedOut = current.carriedOut
        .map((invoice) => ({
          ...toStudent(invoice),
          salaryMonth: (invoice.salaryIndex % 12) + 1,
          salaryYear: Math.floor(invoice.salaryIndex / 12),
          writtenOff: invoice.writtenOff
        }))
        .sort(byPaidAt);
      const carriedOutShare = carriedOut.reduce((sum, item) => sum + item.share, 0);
      const waiting = current.waiting.map(toStudent).sort(byName);
      const waitingShare = waiting.reduce((sum, item) => sum + item.share, 0);
      const cutoffPassed = input.now.getTime() >= resolver.end(index).getTime();
      // Bỏ qua dư nợ: phần chưa trả coi như xong (phải trả = đã trả), giữ "Tổng tháng" để đối chiếu.
      const writeOff = writeOffs.get(`${classRoom.id}:${index}`) ?? null;
      const computation =
        writeOff && computed.mode === "percent"
          ? { ...computed, due: computed.paidOut, difference: 0 }
          : computed;

      lines.push({
        classId: classRoom.id,
        className: classRoom.name,
        shortCode: classRoom.shortCode,
        teacherName: classRoom.teacherName.trim(),
        archived: Boolean(classRoom.archivedAt),
        classSharePercent: classRoom.teacherSharePercent,
        cutoff,
        customCutoff: custom !== null,
        month: (index % 12) + 1,
        year: Math.floor(index / 12),
        collected,
        ownCollected: current.onTime,
        cutoffDate: resolver.date(index),
        cutoffOverridden: resolver.overridden(index),
        cutoffFromPayout: resolver.fromPayout(index),
        cutoffPassed,
        ...computation,
        payouts: records,
        paidBank: records.filter((record) => record.paymentMethod !== "cash").reduce((sum, record) => sum + record.amount, 0),
        paidCash: records.filter((record) => record.paymentMethod === "cash").reduce((sum, record) => sum + record.amount, 0),
        carriedIn,
        carriedInShare,
        carriedOut,
        carriedOutShare,
        waiting,
        waitingShare,
        debt: carriedOutShare + computed.difference,
        writeOff: writeOff ? { note: writeOff.note, createdAt: writeOff.createdAt } : null,
        grossDue: computed.due,
        status: writeOff
          ? { key: "writtenOff", label: "Đã bỏ qua dư nợ", tone: "neutral" }
          : salaryStatus({
              mode: computation.mode,
              paidOut: computation.paidOut,
              difference: computation.difference,
              waitingCount: cutoffPassed ? 0 : waiting.length,
              waitingShare: cutoffPassed ? 0 : waitingShare
            })
      });
    }
  }
  return lines;
}

const salaryRecordSelect = {
  id: true,
  classId: true,
  month: true,
  year: true,
  amount: true,
  sharePercent: true,
  baseAmount: true,
  description: true,
  note: true,
  paidAt: true,
  paymentMethod: true,
  createdAt: true
} as const;

/** Ngày chốt lương chung của trung tâm (Cài đặt), mặc định cuối tháng. */
export async function loadDefaultSalaryCutoff(db: Db = prisma) {
  const row = await db.appSetting.findUnique({ where: { key: SALARY_CUTOFF_SETTING_KEY } });
  return parseSalaryCutoff(row?.value) ?? DEFAULT_SALARY_CUTOFF;
}

/** Ngày chốt đặt riêng của các tháng (ít dòng nên đọc hết). */
export function loadSalaryMonthCutoffs(db: Db = prisma) {
  return db.salaryMonthCutoff.findMany({
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { month: true, year: true, cutoffDate: true }
  });
}

async function loadSalaryInput(options: {
  fromIndex: number;
  toIndex: number;
  db?: Db;
  classIds?: string[];
  now?: Date;
}): Promise<SalaryInput> {
  const db = options.db ?? prisma;
  // Nộp muộn hơn một năm vẫn được tính nếu kỳ học phí nằm trong năm liền trước.
  const invoiceYears = {
    year: { gte: Math.floor(options.fromIndex / 12) - 1, lte: Math.floor(options.toIndex / 12) }
  };
  const recordYears = {
    year: { gte: Math.floor(options.fromIndex / 12), lte: Math.floor(options.toIndex / 12) }
  };
  const classFilter = options.classIds ? { in: options.classIds } : undefined;
  const [defaultCutoff, monthCutoffs, writeOffs, classes, invoices, records] = await Promise.all([
    loadDefaultSalaryCutoff(db),
    loadSalaryMonthCutoffs(db),
    db.salaryWriteOff.findMany({
      where: classFilter ? { classId: classFilter } : {},
      select: { classId: true, month: true, year: true, note: true, createdAt: true }
    }),
    db.classRoom.findMany({
      where: classFilter ? { id: classFilter } : {},
      orderBy: [{ teacherName: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        shortCode: true,
        teacherName: true,
        teacherSharePercent: true,
        archivedAt: true,
        salaryCutoff: true
      }
    }),
    db.monthlyInvoice.findMany({
      where: {
        ...invoiceYears,
        status: { in: ["paid", "unpaid"] },
        ...(classFilter ? { enrollment: { classId: classFilter } } : {})
      },
      select: {
        id: true,
        month: true,
        year: true,
        status: true,
        amount: true,
        paidAmount: true,
        paidAt: true,
        studentNameSnapshot: true,
        enrollment: { select: { classId: true, student: { select: { fullName: true } } } }
      }
    }),
    db.expense.findMany({
      where: { ...recordYears, category: "teacher_salary", classId: classFilter ?? { not: null } },
      orderBy: { createdAt: "asc" },
      select: salaryRecordSelect
    })
  ]);

  return {
    fromIndex: options.fromIndex,
    toIndex: options.toIndex,
    now: options.now ?? new Date(),
    defaultCutoff,
    monthCutoffs,
    writeOffs,
    classes,
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      classId: invoice.enrollment.classId,
      month: invoice.month,
      year: invoice.year,
      status: invoice.status === "paid" ? "paid" : "unpaid",
      amount: invoice.amount,
      paidAmount: invoice.paidAmount,
      paidAt: invoice.paidAt,
      studentName: invoice.enrollment.student.fullName || invoice.studentNameSnapshot || "Học sinh"
    })),
    records: records.flatMap((record) => (record.classId ? [{ ...record, classId: record.classId }] : []))
  };
}

/** Bảng lương của một tháng lương, mỗi dòng một lớp (lớp không liên quan lương thì bỏ qua). */
export async function loadSalaryLines(
  month: number,
  year: number,
  options: { db?: Db; classIds?: string[]; now?: Date } = {}
): Promise<SalaryLine[]> {
  const index = periodIndex(month, year);
  const input = await loadSalaryInput({ ...options, fromIndex: index, toIndex: index });
  return computeSalaryLines(input, { keepIdle: true });
}

export type TeacherSalaryGroup = {
  teacherName: string;
  lines: SalaryLine[];
  due: number;
  paidOut: number;
  difference: number;
};

/** Gom các lớp theo giáo viên. */
export function groupSalaryByTeacher(lines: SalaryLine[]): TeacherSalaryGroup[] {
  const groups = new Map<string, TeacherSalaryGroup>();
  for (const line of lines) {
    const group =
      groups.get(line.teacherName) ??
      { teacherName: line.teacherName, lines: [], due: 0, paidOut: 0, difference: 0 };
    group.lines.push(line);
    group.due += line.due;
    group.paidOut += line.paidOut;
    group.difference += line.difference;
    groups.set(line.teacherName, group);
  }
  return [...groups.values()];
}

/**
 * Các tháng lương đã qua ngày chốt mà còn lệch: chưa chuyển đủ hoặc chuyển dư (thanh toán bị
 * hoàn). Chỉ xét từ tháng đầu tiên có bản ghi lương tính theo % để không báo các tháng trước khi
 * bắt đầu dùng tính năng này.
 */
export async function getPendingSalaryLines(now = new Date()): Promise<SalaryLine[]> {
  const first = await prisma.expense.findFirst({
    where: { category: "teacher_salary", classId: { not: null }, sharePercent: { not: null } },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: { month: true, year: true }
  });
  if (!first) return [];

  const fromIndex = periodIndex(first.month, first.year);
  const toIndex = periodIndex(now.getMonth() + 1, now.getFullYear());
  if (fromIndex > toIndex) return [];
  const input = await loadSalaryInput({ fromIndex, toIndex, now });
  return computeSalaryLines(input)
    .filter((line) => line.cutoffPassed && line.mode === "percent" && line.difference !== 0)
    .sort(
      (a, b) =>
        periodIndex(a.month, a.year) - periodIndex(b.month, b.year) || a.className.localeCompare(b.className)
    );
}

/** Mô tả bản ghi chi phí cho một lần chuyển lương. */
export function salaryPayoutDescription(
  line: Pick<SalaryLine, "teacherName" | "className" | "month" | "year" | "payouts">,
  amount: number,
  method: "bank_transfer" | "cash" = "bank_transfer"
) {
  const teacher = line.teacherName || "giáo viên";
  const period = `T${line.month}/${line.year}`;
  const how = method === "cash" ? " · tiền mặt" : " · chuyển khoản";
  if (amount < 0) return `Trừ lương ${teacher} · ${line.className} ${period}${how} (chuyển dư/học phí bị hoàn)`;
  const previous = line.payouts.filter((record) => record.amount > 0).length;
  return previous === 0
    ? `Lương ${teacher} · ${line.className} ${period}${how}`
    : `Chuyển thêm lương ${teacher} · ${line.className} ${period}${how} (lần ${previous + 1})`;
}

/**
 * Ghi chú gửi kèm thông báo khi một thanh toán thay đổi: khoản nộp sau ngày chốt được tính sang
 * tháng lương nào, và nhắc chuyển thêm/kiểm tra nếu tháng lương đó đã có lần chuyển.
 */
export async function settledSalaryNote(invoiceId: string | null) {
  if (!invoiceId) return "";
  const invoice = await prisma.monthlyInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      month: true,
      year: true,
      status: true,
      paidAt: true,
      enrollment: { select: { classId: true, classRoom: { select: { name: true, salaryCutoff: true } } } }
    }
  });
  if (!invoice) return "";
  const { classId, classRoom } = invoice.enrollment;
  const tuitionIndex = periodIndex(invoice.month, invoice.year);

  if (invoice.status === "paid" && invoice.paidAt) {
    const custom = parseSalaryCutoff(classRoom.salaryCutoff);
    const classRecords = await prisma.expense.findMany({
      where: { category: "teacher_salary", classId },
      select: { month: true, year: true, amount: true, paidAt: true, createdAt: true }
    });
    const resolver = withPayoutDates(
      custom
        ? cutoffResolver(custom)
        : cutoffResolver(
            await loadDefaultSalaryCutoff(),
            new Map((await loadSalaryMonthCutoffs()).map((item) => [periodIndex(item.month, item.year), item.cutoffDate]))
          ),
      (index) => firstPayoutAt(classRecords.filter((record) => periodIndex(record.month, record.year) === index))
    );
    const salaryIndex = salaryIndexForPayment(tuitionIndex, invoice.paidAt, resolver);
    const month = (salaryIndex % 12) + 1;
    const year = Math.floor(salaryIndex / 12);
    const paid = await prisma.expense.count({ where: { category: "teacher_salary", classId, month, year } });
    const moved =
      salaryIndex !== tuitionIndex ? ` Nộp sau ngày chốt lương nên tính vào lương GV tháng ${month}/${year}.` : "";
    return paid > 0
      ? `${moved} Lớp ${classRoom.name} đã chuyển lương T${month}/${year} — vào Lương GV để chuyển thêm.`
      : moved;
  }

  // Bỏ gán/hoàn tác: không còn biết khoản này từng nằm ở tháng lương nào, nhắc kiểm tra chung.
  const paid = await prisma.expense.count({
    where: {
      category: "teacher_salary",
      classId,
      OR: [{ year: { gt: invoice.year } }, { year: invoice.year, month: { gte: invoice.month } }]
    }
  });
  return paid > 0
    ? ` Lớp ${classRoom.name} đã chuyển lương từ T${invoice.month}/${invoice.year} — kiểm tra lại ở Lương GV.`
    : "";
}

// ---------------------------------------------------------------------------
// Sổ lương: mỗi giáo viên → mỗi lớp → mỗi tháng lương, giống bảng "Tổng tháng / Đã chuyển /
// Chuyển thêm / Dư nợ / Ghi chú" làm tay, nhưng tự ghi chú HS nộp muộn và chưa nộp.
// ---------------------------------------------------------------------------

export type LedgerClass = {
  classId: string;
  className: string;
  shortCode: string;
  archived: boolean;
  classSharePercent: number;
  cutoff: SalaryCutoff;
  customCutoff: boolean;
  periods: SalaryLine[];
  due: number;
  paidOut: number;
  /** Tổng còn nợ (dương) của các tháng chưa chuyển đủ; tháng chuyển dư không bù trừ vào đây. */
  owed: number;
  /** Lương sẽ phát sinh thêm nếu HS chưa nộp nộp trước ngày chốt. */
  waitingShare: number;
};

export type TeacherLedger = {
  teacherName: string;
  classes: LedgerClass[];
  due: number;
  paidOut: number;
  owed: number;
  waitingShare: number;
  /** Số tháng-lớp còn lệch (chưa chuyển đủ hoặc chuyển dư). */
  openPeriods: number;
};

/** Gom các dòng lương thành sổ theo giáo viên → lớp → tháng. */
export function buildSalaryLedger(lines: SalaryLine[]): TeacherLedger[] {
  const classes = new Map<string, LedgerClass>();
  const teacherOf = new Map<string, string>();
  for (const line of lines) {
    const ledgerClass =
      classes.get(line.classId) ??
      {
        classId: line.classId,
        className: line.className,
        shortCode: line.shortCode,
        archived: line.archived,
        classSharePercent: line.classSharePercent,
        cutoff: line.cutoff,
        customCutoff: line.customCutoff,
        periods: [],
        due: 0,
        paidOut: 0,
        owed: 0,
        waitingShare: 0
      };
    ledgerClass.periods.push(line);
    ledgerClass.due += line.due;
    ledgerClass.paidOut += line.paidOut;
    ledgerClass.owed += Math.max(0, line.difference);
    if (!line.cutoffPassed) ledgerClass.waitingShare += line.waitingShare;
    classes.set(line.classId, ledgerClass);
    teacherOf.set(line.classId, line.teacherName);
  }

  const teachers = new Map<string, TeacherLedger>();
  for (const ledgerClass of classes.values()) {
    ledgerClass.periods.sort((a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year));
    const teacherName = teacherOf.get(ledgerClass.classId) ?? "";
    const teacher =
      teachers.get(teacherName) ??
      { teacherName, classes: [], due: 0, paidOut: 0, owed: 0, waitingShare: 0, openPeriods: 0 };
    teacher.classes.push(ledgerClass);
    teacher.due += ledgerClass.due;
    teacher.paidOut += ledgerClass.paidOut;
    teacher.owed += ledgerClass.owed;
    teacher.waitingShare += ledgerClass.waitingShare;
    teacher.openPeriods += ledgerClass.periods.filter(
      (period) => period.mode === "percent" && period.difference !== 0
    ).length;
    teachers.set(teacherName, teacher);
  }

  return [...teachers.values()]
    .map((teacher) => ({
      ...teacher,
      classes: teacher.classes.sort(
        (a, b) => Number(a.archived) - Number(b.archived) || nameCollator.compare(a.className, b.className)
      )
    }))
    .sort((a, b) => {
      // Lớp chưa ghi tên giáo viên xếp cuối.
      if (!a.teacherName || !b.teacherName) return a.teacherName ? -1 : b.teacherName ? 1 : 0;
      return nameCollator.compare(a.teacherName, b.teacherName);
    });
}

/** Sổ lương mọi giáo viên trong khoảng tháng lương [fromIndex, toIndex]. */
export async function loadSalaryLedger(options: { fromIndex: number; toIndex: number; db?: Db; now?: Date }) {
  return buildSalaryLedger(computeSalaryLines(await loadSalaryInput(options)));
}

/** Ghi chú ngắn về HS nộp muộn/chưa nộp của một tháng lương (dùng chung cho trang và tin nhắn). */
export function salaryLineNotes(line: SalaryLine) {
  const notes: Array<{ tone: "in" | "out" | "waiting" | "writeOff"; label: string; text: string }> = [];
  if (line.writeOff) {
    notes.push({
      tone: "writeOff",
      label: "Đã bỏ qua dư nợ",
      text: `${formatCurrency(line.debt)}${line.writeOff.note ? ` · ${line.writeOff.note}` : ""}`
    });
  }
  if (line.carriedIn.length > 0) {
    notes.push({
      tone: "in",
      label: "Nộp muộn tháng trước, tính vào đây",
      text: `${line.carriedIn
        .map((item) => `${item.studentName} (T${item.month}${item.paidAt ? ` · nộp ${formatDayMonth(item.paidAt)}` : ""})`)
        .join(", ")} · +${formatCurrency(line.carriedInShare)}`
    });
  }
  if (line.carriedOut.length > 0) {
    notes.push({
      tone: "out",
      label: `Nộp sau ngày chốt ${formatDayMonth(line.cutoffDate)}, tính sang lương sau`,
      text: line.carriedOut
        .map(
          (item) =>
            `${item.studentName} (${item.paidAt ? `nộp ${formatDayMonth(item.paidAt)} → ` : ""}${
              item.writtenOff ? "đã bỏ qua" : `T${item.salaryMonth}`
            })`
        )
        .join(", ")
    });
  }
  if (line.waiting.length > 0) {
    notes.push({
      tone: "waiting",
      label: `Chưa nộp (${line.waiting.length})`,
      text: `${line.waiting.map((item) => item.studentName).join(", ")}${
        line.cutoffPassed
          ? " · nộp sau sẽ tính vào lương tháng sau"
          : ` · +${formatCurrency(line.waitingShare)} nếu nộp trước ${formatDayMonth(line.cutoffDate)}`
      }`
    });
  }
  return notes;
}

/** Tin nhắn tóm tắt lương để gửi giáo viên qua Zalo. */
export function buildTeacherSalaryMessage(teacher: TeacherLedger, now = new Date()) {
  const lines: string[] = [
    `Bảng lương ${teacher.teacherName || "giáo viên"} — cập nhật ${now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`
  ];
  for (const classRoom of teacher.classes) {
    lines.push("", `▸ ${classRoom.className} (${classRoom.shortCode})`);
    for (const period of classRoom.periods) {
      const base =
        period.mode === "percent"
          ? ` (${period.sharePercent}% × ${formatCurrency(period.ownCollected)}${
              period.carriedInShare > 0 ? ` + nộp muộn ${formatCurrency(period.carriedInShare)}` : ""
            })`
          : "";
      lines.push(
        `• Lương T${period.month}/${period.year}, chốt ${formatDayMonth(period.cutoffDate)}: ${formatCurrency(period.grossDue)}${base}`
      );
      for (const note of salaryLineNotes(period)) lines.push(`   ${note.label}: ${note.text}`);
      if (period.payouts.length > 0) {
        const transfers = period.payouts
          .map(
            (payout) =>
              `${payout.paymentMethod === "cash" ? "TM" : "CK"} ${formatCurrency(payout.amount)} (${formatDayMonth(payout.paidAt ?? payout.createdAt)})`
          )
          .join(" + ");
        lines.push(`   Đã chuyển: ${transfers}`);
      }
      if (!period.writeOff && period.debt !== 0) {
        const parts = [
          period.carriedOutShare > 0 ? `muộn ${formatCurrency(period.carriedOutShare)} sang tháng sau` : "",
          period.difference > 0 ? `chưa trả ${formatCurrency(period.difference)}` : "",
          period.difference < 0 ? `trả dư ${formatCurrency(-period.difference)}` : ""
        ].filter(Boolean);
        lines.push(`   Dư nợ: ${formatCurrency(period.debt)} (${parts.join(" + ")})`);
      }
    }
  }
  lines.push("", teacher.owed > 0 ? `Tổng còn lại: ${formatCurrency(teacher.owed)}` : "Đã thanh toán đủ.");
  return lines.join("\n");
}

const PAYSLIP_RULE = "──────────────";

/**
 * Phiếu lương một tháng của một giáo viên (gộp mọi lớp), dạng chữ để dán Zalo: lương từng lớp,
 * tổng, các lần đã trả, còn lại, và ghi chú HS nộp muộn/chưa nộp. Tháng chưa tới ngày chốt ghi "tạm tính".
 */
export function buildTeacherPayslip(teacher: TeacherLedger, month: number, year: number, now = new Date()) {
  const index = periodIndex(month, year);
  const all = teacher.classes.flatMap((classRoom) => classRoom.periods);
  const periods = all.filter((period) => period.month === month && period.year === year);
  const provisional = periods.some((period) => !period.cutoffPassed);
  const total = (pick: (period: SalaryLine) => number) => periods.reduce((sum, period) => sum + pick(period), 0);
  const lines = [
    `PHIẾU LƯƠNG THÁNG ${month}/${year}${provisional ? " (tạm tính)" : ""}`,
    CENTER_INFO.name,
    `Giáo viên: ${teacher.teacherName || "chưa ghi tên"}`,
    `Ngày lập: ${now.toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
    PAYSLIP_RULE
  ];

  periods.forEach((period, position) => {
    lines.push(`${position + 1}. ${period.className}`);
    if (period.mode === "percent") {
      lines.push(
        period.cutoffPassed
          ? `   Học phí thu đến ${formatDayMonth(period.cutoffDate)}: ${formatCurrency(period.ownCollected)}`
          : `   Học phí đã thu đến nay (chốt ${formatDayMonth(period.cutoffDate)}): ${formatCurrency(period.ownCollected)}`
      );
      lines.push(`   Lương ${period.sharePercent}%: ${formatCurrency(period.grossDue - period.carriedInShare)}`);
      if (period.carriedInShare > 0) {
        lines.push(`   Nộp muộn tháng trước: +${formatCurrency(period.carriedInShare)}`);
      }
    }
    lines.push(`   Lương tháng: ${formatCurrency(period.grossDue)}${period.mode === "percent" ? "" : " (nhập tay)"}`);
  });

  lines.push(PAYSLIP_RULE, `TỔNG LƯƠNG T${month}: ${formatCurrency(total((period) => period.grossDue))}`);
  const payouts = periods
    .flatMap((period) => period.payouts)
    .sort((a, b) => (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime());
  const paidLine = (label: string, cash: boolean) => {
    const items = payouts.filter((payout) => (payout.paymentMethod === "cash") === cash);
    if (items.length === 0) return;
    const days = [...new Set(items.map((payout) => formatDayMonth(payout.paidAt ?? payout.createdAt)))].join(", ");
    lines.push(`${label}: ${formatCurrency(items.reduce((sum, payout) => sum + payout.amount, 0))} (${days})`);
  };
  paidLine("Đã chuyển khoản", false);
  paidLine("Đã trả tiền mặt", true);
  if (payouts.length === 0) lines.push("Chưa chuyển.");

  const remaining = total((period) => Math.max(0, period.difference));
  const over = total((period) => Math.max(0, -period.difference));
  if (remaining > 0) lines.push(`CÒN LẠI${provisional ? " (tạm tính)" : ""}: ${formatCurrency(remaining)}`);
  if (over > 0) lines.push(`Trả dư: ${formatCurrency(over)} (trừ vào lương tháng sau)`);
  if (remaining === 0 && over === 0 && payouts.length > 0) lines.push("ĐÃ THANH TOÁN ĐỦ");

  const earlier = all.filter((period) => periodIndex(period.month, period.year) < index && period.difference > 0);
  if (earlier.length > 0) {
    lines.push(
      `Lương tháng trước còn thiếu: ${earlier
        .map((period) => `${period.className} T${period.month}: ${formatCurrency(period.difference)}`)
        .join("; ")}`
    );
  }

  const notes = periods.flatMap((period) =>
    salaryLineNotes(period).map(
      (note) => `• ${periods.length > 1 ? `${period.className} — ` : ""}${note.label}: ${note.text}`
    )
  );
  if (notes.length > 0) lines.push(PAYSLIP_RULE, "Ghi chú:", ...notes);
  return lines.join("\n");
}
