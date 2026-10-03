import { Prisma } from "@prisma/client";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import { periodIndex } from "@/lib/enrollment-period";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SALARY_CUTOFF,
  parseSalaryCutoff,
  SALARY_CUTOFF_SETTING_KEY,
  salaryCutoffDate,
  salaryCutoffEnd,
  salaryIndexForPayment,
  type SalaryCutoff
} from "@/lib/salary-cutoff";

/**
 * Lương giáo viên theo THÁNG LƯƠNG có ngày chốt (xem salary-cutoff.ts):
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
}): SalaryComputation {
  const records = [...input.records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const paidOut = records.reduce((sum, record) => sum + record.amount, 0);
  if (records.some((record) => record.sharePercent === null)) {
    return { mode: "manual", sharePercent: 0, due: paidOut, paidOut, difference: 0 };
  }
  const sharePercent = records[0]?.sharePercent ?? input.classSharePercent;
  const due = Math.round((input.collected * sharePercent) / 100);
  return { mode: "percent", sharePercent, due, paidOut, difference: due - paidOut };
}

export type SalaryStatus = {
  key: "manual" | "unpaid" | "partial" | "advance" | "over" | "waiting" | "done" | "empty";
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

export type CarriedOutStudent = LedgerStudent & { salaryMonth: number; salaryYear: number };

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
  cutoffDate: Date;
  cutoffPassed: boolean;
  /** Các lần chuyển lương của tháng, theo thứ tự ghi. */
  payouts: SalaryRecord[];
  /** HS các tháng trước nộp sau ngày chốt của tháng đó → tính vào lương tháng này. */
  carriedIn: LedgerStudent[];
  carriedInShare: number;
  /** HS của tháng này nộp sau ngày chốt → tính vào lương tháng sau. */
  carriedOut: CarriedOutStudent[];
  carriedOutShare: number;
  /** HS chưa nộp học phí kỳ này. */
  waiting: LedgerStudent[];
  waitingShare: number;
  status: SalaryStatus;
};

export type SalaryInput = {
  /** Khoảng tháng lương cần tính, tính bằng periodIndex, gồm cả hai đầu. */
  fromIndex: number;
  toIndex: number;
  now: Date;
  defaultCutoff: SalaryCutoff;
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
};

const nameCollator = new Intl.Collator("vi");
const byName = (a: { studentName: string }, b: { studentName: string }) =>
  nameCollator.compare(a.studentName, b.studentName);
const byPaidAt = (a: { paidAt: Date | null }, b: { paidAt: Date | null }) =>
  (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0);

type Bucket = {
  onTime: number;
  carriedIn: SalaryInput["invoices"];
  carriedOut: Array<SalaryInput["invoices"][number] & { salaryIndex: number }>;
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

    for (const invoice of invoicesByClass.get(classRoom.id) ?? []) {
      const tuitionIndex = periodIndex(invoice.month, invoice.year);
      if (invoice.status === "unpaid") {
        if (inRange(tuitionIndex)) bucket(tuitionIndex).waiting.push(invoice);
        continue;
      }
      const salaryIndex = invoice.paidAt ? salaryIndexForPayment(tuitionIndex, invoice.paidAt, cutoff) : tuitionIndex;
      if (inRange(salaryIndex)) {
        if (salaryIndex === tuitionIndex) bucket(salaryIndex).onTime += invoice.paidAmount ?? invoice.amount;
        else bucket(salaryIndex).carriedIn.push(invoice);
      }
      if (salaryIndex !== tuitionIndex && inRange(tuitionIndex)) {
        bucket(tuitionIndex).carriedOut.push({ ...invoice, salaryIndex });
      }
    }
    for (const record of recordsByClass.get(classRoom.id) ?? []) {
      const index = periodIndex(record.month, record.year);
      if (inRange(index)) bucket(index).records.push(record);
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
      const collected = current.onTime + current.carriedIn.reduce((sum, invoice) => sum + received(invoice), 0);
      const computation = computeSalary({ collected, classSharePercent: classRoom.teacherSharePercent, records });
      const shareOf = (amount: number) =>
        computation.mode === "percent" ? Math.round((amount * computation.sharePercent) / 100) : 0;
      const toStudent = (invoice: SalaryInput["invoices"][number]): LedgerStudent => ({
        invoiceId: invoice.id,
        studentName: invoice.studentName,
        month: invoice.month,
        year: invoice.year,
        amount: invoice.status === "paid" ? received(invoice) : invoice.amount,
        share: shareOf(invoice.status === "paid" ? received(invoice) : invoice.amount),
        paidAt: invoice.paidAt
      });

      const carriedIn = current.carriedIn.map(toStudent).sort(byPaidAt);
      const carriedOut = current.carriedOut
        .map((invoice) => ({
          ...toStudent(invoice),
          salaryMonth: (invoice.salaryIndex % 12) + 1,
          salaryYear: Math.floor(invoice.salaryIndex / 12)
        }))
        .sort(byPaidAt);
      const waiting = current.waiting.map(toStudent).sort(byName);
      const waitingShare = waiting.reduce((sum, item) => sum + item.share, 0);
      const cutoffPassed = input.now.getTime() >= salaryCutoffEnd(cutoff, index).getTime();

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
        cutoffDate: salaryCutoffDate(cutoff, index),
        cutoffPassed,
        ...computation,
        payouts: records,
        carriedIn,
        carriedInShare: carriedIn.reduce((sum, item) => sum + item.share, 0),
        carriedOut,
        carriedOutShare: carriedOut.reduce((sum, item) => sum + item.share, 0),
        waiting,
        waitingShare,
        status: salaryStatus({
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
  createdAt: true
} as const;

/** Ngày chốt lương chung của trung tâm (Cài đặt), mặc định cuối tháng. */
export async function loadDefaultSalaryCutoff(db: Db = prisma) {
  const row = await db.appSetting.findUnique({ where: { key: SALARY_CUTOFF_SETTING_KEY } });
  return parseSalaryCutoff(row?.value) ?? DEFAULT_SALARY_CUTOFF;
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
  const [defaultCutoff, classes, invoices, records] = await Promise.all([
    loadDefaultSalaryCutoff(db),
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
  amount: number
) {
  const teacher = line.teacherName || "giáo viên";
  const period = `T${line.month}/${line.year}`;
  if (amount < 0) return `Trừ lương ${teacher} · ${line.className} ${period} (chuyển dư/học phí bị hoàn)`;
  const previous = line.payouts.filter((record) => record.amount > 0).length;
  return previous === 0
    ? `Lương ${teacher} · ${line.className} ${period}`
    : `Chuyển thêm lương ${teacher} · ${line.className} ${period} (lần ${previous + 1})`;
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
    const cutoff = parseSalaryCutoff(classRoom.salaryCutoff) ?? (await loadDefaultSalaryCutoff());
    const salaryIndex = salaryIndexForPayment(tuitionIndex, invoice.paidAt, cutoff);
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
  const notes: Array<{ tone: "in" | "out" | "waiting"; label: string; text: string }> = [];
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
            `${item.studentName} (${item.paidAt ? `nộp ${formatDayMonth(item.paidAt)} → ` : ""}T${item.salaryMonth})`
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
        period.mode === "percent" ? ` (${period.sharePercent}% × ${formatCurrency(period.collected)})` : "";
      lines.push(
        `• Lương T${period.month}/${period.year}, chốt ${formatDayMonth(period.cutoffDate)}: ${formatCurrency(period.due)}${base}`
      );
      for (const note of salaryLineNotes(period)) lines.push(`   ${note.label}: ${note.text}`);
      if (period.payouts.length > 0) {
        const transfers = period.payouts
          .map((payout) => `${formatCurrency(payout.amount)} (${formatDayMonth(payout.paidAt ?? payout.createdAt)})`)
          .join(" + ");
        lines.push(`   Đã chuyển: ${transfers}`);
      }
      if (period.difference > 0) lines.push(`   Còn lại: ${formatCurrency(period.difference)}`);
      else if (period.difference < 0) lines.push(`   Chuyển dư: ${formatCurrency(-period.difference)}`);
    }
  }
  lines.push("", teacher.owed > 0 ? `Tổng còn lại: ${formatCurrency(teacher.owed)}` : "Đã thanh toán đủ.");
  return lines.join("\n");
}
