import { Prisma } from "@prisma/client";
import { formatCurrency, formatDayMonth } from "@/lib/format";
import { periodIndex } from "@/lib/enrollment-period";
import { prisma } from "@/lib/prisma";

/**
 * Lương giáo viên tính theo ĐÚNG kỳ học phí:
 *   lương phải trả của kỳ = % chia × học phí thực thu của các hóa đơn thuộc kỳ đó.
 * Số này luôn tính sẵn. Mỗi lần trung tâm chuyển tiền cho giáo viên được ghi thành một bản ghi
 * chi phí của CHÍNH kỳ đó (trả một phần, chuyển thêm, chuyển bù khi HS nộp muộn, hoặc số âm khi
 * trừ lại phần chuyển dư). Còn nợ giáo viên = phải trả − tổng đã chuyển của kỳ.
 * Nhờ vậy tiền tháng 9 nộp muộn vẫn nằm ở tháng 9, không gộp sang tháng khác.
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
  /** percent: tính theo % học phí; manual: kỳ có bản ghi lương nhập tay, không tự đối chiếu. */
  mode: "percent" | "manual";
  sharePercent: number;
  due: number;
  /** Tổng đã chuyển cho giáo viên của kỳ. */
  paidOut: number;
  /** Phải trả − đã chuyển: dương = còn nợ giáo viên, âm = đã chuyển dư. */
  difference: number;
};

export type SalaryLine = SalaryComputation & {
  classId: string;
  className: string;
  shortCode: string;
  teacherName: string;
  archived: boolean;
  month: number;
  year: number;
  collected: number;
  records: SalaryRecord[];
};

/**
 * Tỷ lệ % được khóa theo lần chuyển lương đầu tiên của kỳ (đổi % của lớp sau đó không làm đổi
 * lương các kỳ đã chuyển); kỳ chưa chuyển dùng % hiện tại của lớp.
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

/** Bảng lương của một kỳ, mỗi dòng một lớp (lớp không liên quan lương thì bỏ qua). */
export async function loadSalaryLines(
  month: number,
  year: number,
  options: { db?: Db; classIds?: string[] } = {}
): Promise<SalaryLine[]> {
  const db = options.db ?? prisma;
  const classFilter = options.classIds ? { id: { in: options.classIds } } : {};
  const [classes, paidInvoices, records] = await Promise.all([
    db.classRoom.findMany({
      where: classFilter,
      orderBy: [{ teacherName: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        shortCode: true,
        teacherName: true,
        teacherSharePercent: true,
        archivedAt: true
      }
    }),
    db.monthlyInvoice.findMany({
      where: {
        month,
        year,
        status: "paid",
        ...(options.classIds ? { enrollment: { classId: { in: options.classIds } } } : {})
      },
      select: { amount: true, paidAmount: true, enrollment: { select: { classId: true } } }
    }),
    db.expense.findMany({
      where: {
        month,
        year,
        category: "teacher_salary",
        classId: options.classIds ? { in: options.classIds } : { not: null }
      },
      orderBy: { createdAt: "asc" },
      select: salaryRecordSelect
    })
  ]);

  const collectedByClass = new Map<string, number>();
  for (const invoice of paidInvoices) {
    const classId = invoice.enrollment.classId;
    collectedByClass.set(classId, (collectedByClass.get(classId) ?? 0) + (invoice.paidAmount ?? invoice.amount));
  }
  const recordsByClass = new Map<string, SalaryRecord[]>();
  for (const record of records) {
    if (!record.classId) continue;
    const list = recordsByClass.get(record.classId) ?? [];
    list.push(record);
    recordsByClass.set(record.classId, list);
  }

  return classes
    .map((classRoom) => {
      const collected = collectedByClass.get(classRoom.id) ?? 0;
      const classRecords = recordsByClass.get(classRoom.id) ?? [];
      return {
        classId: classRoom.id,
        className: classRoom.name,
        shortCode: classRoom.shortCode,
        teacherName: classRoom.teacherName.trim(),
        archived: Boolean(classRoom.archivedAt),
        month,
        year,
        collected,
        records: classRecords,
        ...computeSalary({
          collected,
          classSharePercent: classRoom.teacherSharePercent,
          records: classRecords
        })
      };
    })
    .filter(
      (line) =>
        line.collected > 0 || line.records.length > 0 || (!line.archived && line.sharePercent > 0)
    );
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
 * Các kỳ trước (trước tháng hiện tại) còn lệch lương: chưa chuyển đủ (kể cả HS nộp muộn sau khi
 * đã chuyển) hoặc chuyển dư (thanh toán bị hoàn). Chỉ xét từ kỳ đầu tiên có bản ghi lương tính
 * theo % để không báo các tháng trước khi bắt đầu dùng tính năng này.
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
  if (fromIndex >= toIndex) return [];

  const [collectedRows, records, classes] = await Promise.all([
    prisma.$queryRaw<Array<{ classId: string; month: number; year: number; collected: bigint }>>(Prisma.sql`
      SELECT e."classId" AS "classId", mi.month, mi.year,
             SUM(COALESCE(mi."paidAmount", mi.amount))::bigint AS collected
      FROM "MonthlyInvoice" mi
      INNER JOIN "Enrollment" e ON e.id = mi."enrollmentId"
      WHERE mi.status = 'paid'
        AND mi.year * 12 + mi.month - 1 >= ${fromIndex}
        AND mi.year * 12 + mi.month - 1 < ${toIndex}
      GROUP BY e."classId", mi.month, mi.year
    `),
    prisma.expense.findMany({
      where: { category: "teacher_salary", classId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: salaryRecordSelect
    }),
    prisma.classRoom.findMany({
      select: { id: true, name: true, shortCode: true, teacherName: true, teacherSharePercent: true, archivedAt: true }
    })
  ]);

  const key = (classId: string, month: number, year: number) => `${classId}:${year}:${month}`;
  const periods = new Map<string, { classId: string; month: number; year: number; collected: number; records: SalaryRecord[] }>();
  const ensure = (classId: string, month: number, year: number) => {
    const k = key(classId, month, year);
    const entry = periods.get(k) ?? { classId, month, year, collected: 0, records: [] };
    periods.set(k, entry);
    return entry;
  };
  for (const row of collectedRows) {
    ensure(row.classId, row.month, row.year).collected = Number(row.collected);
  }
  for (const record of records) {
    if (!record.classId) continue;
    const index = periodIndex(record.month, record.year);
    if (index < fromIndex || index >= toIndex) continue;
    ensure(record.classId, record.month, record.year).records.push(record);
  }

  const classById = new Map(classes.map((classRoom) => [classRoom.id, classRoom]));
  const lines: SalaryLine[] = [];
  for (const period of periods.values()) {
    const classRoom = classById.get(period.classId);
    if (!classRoom) continue;
    const computation = computeSalary({
      collected: period.collected,
      classSharePercent: classRoom.teacherSharePercent,
      records: period.records
    });
    if (computation.mode !== "percent" || computation.difference === 0) continue;
    lines.push({
      classId: classRoom.id,
      className: classRoom.name,
      shortCode: classRoom.shortCode,
      teacherName: classRoom.teacherName.trim(),
      archived: Boolean(classRoom.archivedAt),
      month: period.month,
      year: period.year,
      collected: period.collected,
      records: period.records,
      ...computation
    });
  }
  return lines.sort(
    (a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year) || a.className.localeCompare(b.className)
  );
}

/** Mô tả bản ghi chi phí cho một lần chuyển lương. */
export function salaryPayoutDescription(
  line: Pick<SalaryLine, "teacherName" | "className" | "month" | "year" | "records">,
  amount: number
) {
  const teacher = line.teacherName || "giáo viên";
  const period = `T${line.month}/${line.year}`;
  if (amount < 0) return `Trừ lương ${teacher} · ${line.className} ${period} (chuyển dư/học phí bị hoàn)`;
  const previous = line.records.filter((record) => record.amount > 0).length;
  return previous === 0
    ? `Lương ${teacher} · ${line.className} ${period}`
    : `Chuyển thêm lương ${teacher} · ${line.className} ${period} (lần ${previous + 1})`;
}

/**
 * Nhắc admin khi một thanh toán thay đổi ở kỳ đã chuyển lương (thu muộn, hoàn tác, bỏ gán):
 * lương kỳ đó cần chuyển bù/trừ lại ở trang Lương GV. Trả chuỗi rỗng nếu không cần.
 */
export async function settledSalaryNote(invoiceId: string | null) {
  if (!invoiceId) return "";
  const invoice = await prisma.monthlyInvoice.findUnique({
    where: { id: invoiceId },
    select: { month: true, year: true, enrollment: { select: { classId: true, classRoom: { select: { name: true } } } } }
  });
  if (!invoice) return "";
  const settled = await prisma.expense.count({
    where: {
      category: "teacher_salary",
      classId: invoice.enrollment.classId,
      month: invoice.month,
      year: invoice.year
    }
  });
  return settled > 0
    ? ` Lớp ${invoice.enrollment.classRoom.name} kỳ T${invoice.month}/${invoice.year} đã chuyển lương — vào Lương GV để chuyển bù/điều chỉnh.`
    : "";
}

// ---------------------------------------------------------------------------
// Sổ lương: mỗi giáo viên → mỗi lớp → mỗi kỳ, giống bảng theo dõi "Đã chuyển / Chuyển thêm /
// Dư nợ" làm tay, nhưng tự biết HS nào nộp muộn hay còn chưa nộp.
// ---------------------------------------------------------------------------

export type SalaryStatus = {
  key: "manual" | "unpaid" | "partial" | "advance" | "over" | "waiting" | "done" | "empty";
  label: string;
  tone: "success" | "warning" | "primary" | "neutral";
};

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
    // Chuyển trước nhiều hơn số đã thu nhưng vẫn còn HS chưa nộp: khi họ nộp sẽ tự cân lại.
    return input.waitingShare >= -input.difference
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
  amount: number;
  /** Phần lương giáo viên tương ứng với khoản học phí này. */
  share: number;
  paidAt: Date | null;
};

export type LedgerPeriod = SalaryComputation & {
  month: number;
  year: number;
  collected: number;
  /** Các lần chuyển lương của kỳ, theo thứ tự ghi. */
  payouts: SalaryRecord[];
  /** HS chưa nộp học phí kỳ này: khi nộp, lương giáo viên của kỳ tăng thêm phần share. */
  waiting: LedgerStudent[];
  waitingShare: number;
  /** HS nộp sau lần chuyển lương đầu tiên của kỳ — lý do phải chuyển bù. */
  latePayers: LedgerStudent[];
  status: SalaryStatus;
};

export type LedgerClass = {
  classId: string;
  className: string;
  shortCode: string;
  archived: boolean;
  classSharePercent: number;
  periods: LedgerPeriod[];
  due: number;
  paidOut: number;
  /** Tổng còn nợ (dương) của các kỳ chưa chuyển đủ; kỳ chuyển dư không bù trừ vào đây. */
  owed: number;
  waitingShare: number;
};

export type TeacherLedger = {
  teacherName: string;
  classes: LedgerClass[];
  due: number;
  paidOut: number;
  owed: number;
  waitingShare: number;
  /** Số kỳ còn lệch (chưa chuyển đủ hoặc chuyển dư). */
  openPeriods: number;
};

export type LedgerInput = {
  /** Khoảng kỳ cần lập sổ, tính bằng periodIndex, gồm cả hai đầu. */
  fromIndex: number;
  toIndex: number;
  classes: Array<{
    id: string;
    name: string;
    shortCode: string;
    teacherName: string;
    teacherSharePercent: number;
    archivedAt: Date | null;
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

/** Lập sổ lương từ dữ liệu thô (hàm thuần để kiểm thử được). */
export function buildSalaryLedger(input: LedgerInput): TeacherLedger[] {
  const inRange = (month: number, year: number) => {
    const index = periodIndex(month, year);
    return index >= input.fromIndex && index <= input.toIndex;
  };
  const key = (classId: string, index: number) => `${classId}:${index}`;

  const invoicesByKey = new Map<string, LedgerInput["invoices"]>();
  for (const invoice of input.invoices) {
    if (!inRange(invoice.month, invoice.year)) continue;
    const k = key(invoice.classId, periodIndex(invoice.month, invoice.year));
    invoicesByKey.set(k, [...(invoicesByKey.get(k) ?? []), invoice]);
  }
  const recordsByKey = new Map<string, SalaryRecord[]>();
  for (const record of input.records) {
    if (!inRange(record.month, record.year)) continue;
    const k = key(record.classId, periodIndex(record.month, record.year));
    recordsByKey.set(k, [...(recordsByKey.get(k) ?? []), record]);
  }

  const teachers = new Map<string, TeacherLedger>();
  for (const classRoom of input.classes) {
    const periods: LedgerPeriod[] = [];
    for (let index = input.fromIndex; index <= input.toIndex; index += 1) {
      const month = (index % 12) + 1;
      const year = Math.floor(index / 12);
      const invoices = invoicesByKey.get(key(classRoom.id, index)) ?? [];
      const records = [...(recordsByKey.get(key(classRoom.id, index)) ?? [])].sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      // Lớp không chia % và chưa từng ghi lương kỳ này thì không thuộc sổ lương.
      if (records.length === 0 && classRoom.teacherSharePercent === 0) continue;

      const paid = invoices.filter((invoice) => invoice.status === "paid");
      const unpaid = invoices.filter((invoice) => invoice.status === "unpaid");
      if (paid.length === 0 && unpaid.length === 0 && records.length === 0) continue;

      const collected = paid.reduce((sum, invoice) => sum + (invoice.paidAmount ?? invoice.amount), 0);
      const computation = computeSalary({
        collected,
        classSharePercent: classRoom.teacherSharePercent,
        records
      });
      const shareOf = (amount: number) =>
        computation.mode === "percent" ? Math.round((amount * computation.sharePercent) / 100) : 0;
      const byName = (a: { studentName: string }, b: { studentName: string }) =>
        nameCollator.compare(a.studentName, b.studentName);

      const waiting = unpaid
        .map((invoice) => ({
          invoiceId: invoice.id,
          studentName: invoice.studentName,
          amount: invoice.amount,
          share: shareOf(invoice.amount),
          paidAt: null
        }))
        .sort(byName);
      const firstPayoutAt = records
        .filter((record) => record.amount > 0)
        .map((record) => (record.paidAt ?? record.createdAt).getTime())
        .sort((a, b) => a - b)[0];
      const latePayers =
        firstPayoutAt === undefined
          ? []
          : paid
              .filter((invoice) => invoice.paidAt && invoice.paidAt.getTime() > firstPayoutAt)
              .map((invoice) => ({
                invoiceId: invoice.id,
                studentName: invoice.studentName,
                amount: invoice.paidAmount ?? invoice.amount,
                share: shareOf(invoice.paidAmount ?? invoice.amount),
                paidAt: invoice.paidAt
              }))
              .sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));
      const waitingShare = waiting.reduce((sum, item) => sum + item.share, 0);

      periods.push({
        month,
        year,
        collected,
        ...computation,
        payouts: records,
        waiting,
        waitingShare,
        latePayers,
        status: salaryStatus({
          mode: computation.mode,
          paidOut: computation.paidOut,
          difference: computation.difference,
          waitingCount: waiting.length,
          waitingShare
        })
      });
    }
    if (periods.length === 0) continue;

    const ledgerClass: LedgerClass = {
      classId: classRoom.id,
      className: classRoom.name,
      shortCode: classRoom.shortCode,
      archived: Boolean(classRoom.archivedAt),
      classSharePercent: classRoom.teacherSharePercent,
      periods,
      due: periods.reduce((sum, period) => sum + period.due, 0),
      paidOut: periods.reduce((sum, period) => sum + period.paidOut, 0),
      owed: periods.reduce((sum, period) => sum + Math.max(0, period.difference), 0),
      waitingShare: periods.reduce((sum, period) => sum + period.waitingShare, 0)
    };
    const teacherName = classRoom.teacherName.trim();
    const teacher =
      teachers.get(teacherName) ??
      { teacherName, classes: [], due: 0, paidOut: 0, owed: 0, waitingShare: 0, openPeriods: 0 };
    teacher.classes.push(ledgerClass);
    teacher.due += ledgerClass.due;
    teacher.paidOut += ledgerClass.paidOut;
    teacher.owed += ledgerClass.owed;
    teacher.waitingShare += ledgerClass.waitingShare;
    teacher.openPeriods += periods.filter((period) => period.mode === "percent" && period.difference !== 0).length;
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
      // Người chưa ghi tên giáo viên xếp cuối.
      if (!a.teacherName || !b.teacherName) return a.teacherName ? -1 : b.teacherName ? 1 : 0;
      return nameCollator.compare(a.teacherName, b.teacherName);
    });
}

/** Sổ lương mọi giáo viên trong khoảng kỳ [fromIndex, toIndex]. */
export async function loadSalaryLedger(options: { fromIndex: number; toIndex: number; db?: Db }) {
  const db = options.db ?? prisma;
  const yearRange = {
    year: { gte: Math.floor(options.fromIndex / 12), lte: Math.floor(options.toIndex / 12) }
  };
  const [classes, invoices, records] = await Promise.all([
    db.classRoom.findMany({
      select: {
        id: true,
        name: true,
        shortCode: true,
        teacherName: true,
        teacherSharePercent: true,
        archivedAt: true
      }
    }),
    db.monthlyInvoice.findMany({
      where: { ...yearRange, status: { in: ["paid", "unpaid"] } },
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
      where: { ...yearRange, category: "teacher_salary", classId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: salaryRecordSelect
    })
  ]);

  return buildSalaryLedger({
    fromIndex: options.fromIndex,
    toIndex: options.toIndex,
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
  });
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
          ? ` (${period.sharePercent}% × ${formatCurrency(period.collected)} đã thu)`
          : "";
      lines.push(`• T${period.month}/${period.year}: phải trả ${formatCurrency(period.due)}${base}`);
      if (period.payouts.length > 0) {
        const transfers = period.payouts
          .map((payout) => `${formatCurrency(payout.amount)} (${formatDayMonth(payout.paidAt ?? payout.createdAt)})`)
          .join(" + ");
        lines.push(`   Đã chuyển: ${transfers}`);
      }
      if (period.difference > 0) lines.push(`   Còn lại: ${formatCurrency(period.difference)}`);
      else if (period.difference < 0) lines.push(`   Chuyển dư: ${formatCurrency(-period.difference)}`);
      if (period.latePayers.length > 0) {
        lines.push(
          `   Nộp muộn: ${period.latePayers
            .map((item) => `${item.studentName}${item.paidAt ? ` (${formatDayMonth(item.paidAt)})` : ""}`)
            .join(", ")}`
        );
      }
      if (period.waiting.length > 0) {
        lines.push(
          `   Chưa nộp: ${period.waiting.map((item) => item.studentName).join(", ")} — sẽ chuyển thêm ${formatCurrency(period.waitingShare)} khi nộp`
        );
      }
    }
  }
  lines.push("", teacher.owed > 0 ? `Tổng còn lại: ${formatCurrency(teacher.owed)}` : "Đã thanh toán đủ phần học phí đã thu.");
  return lines.join("\n");
}
