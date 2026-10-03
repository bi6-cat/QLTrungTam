import { Prisma } from "@prisma/client";
import { periodIndex } from "@/lib/enrollment-period";
import { prisma } from "@/lib/prisma";

/**
 * Lương giáo viên tính theo ĐÚNG kỳ học phí:
 *   lương phải trả của kỳ = % chia × học phí thực thu của các hóa đơn thuộc kỳ đó.
 * Số này luôn tính sẵn, không cần bấm nút. "Chốt lương" chỉ ghi nhận phần chênh lệch giữa số
 * phải trả và số đã chốt thành một bản ghi chi phí của chính kỳ đó: lần đầu là lương, thu muộn
 * là bản ghi bổ sung, hoàn/bỏ gán thanh toán sau khi chốt là bản ghi điều chỉnh âm.
 * Nhờ vậy tiền tháng 9 nộp muộn vẫn nằm ở tháng 9, không gộp sang tháng khác.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type SalaryRecord = {
  id: string;
  amount: number;
  sharePercent: number | null;
  baseAmount: number | null;
  description: string;
  createdAt: Date;
};

export type SalaryComputation = {
  /** percent: tính theo % học phí; manual: kỳ có bản ghi lương nhập tay, không tự đối chiếu. */
  mode: "percent" | "manual";
  sharePercent: number;
  due: number;
  paidOut: number;
  /** Phải trả − đã chốt: dương = cần chốt thêm, âm = đã trả thừa. */
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
 * Tỷ lệ % được khóa theo bản ghi chốt đầu tiên của kỳ (đổi % của lớp sau đó không làm đổi
 * lương các kỳ đã chốt); kỳ chưa chốt dùng % hiện tại của lớp.
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

/** Gom các lớp theo giáo viên để chốt lương từng người. */
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
 * Các kỳ trước (trước tháng hiện tại) còn chênh lệch lương: chưa chốt, thu muộn sau khi chốt,
 * hoặc hoàn tiền sau khi chốt. Chỉ xét từ kỳ đầu tiên có bản ghi lương tính theo % để không báo
 * các tháng trước khi bắt đầu dùng tính năng này.
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

/** Mô tả bản ghi chi phí khi chốt: lương lần đầu, bổ sung thu muộn hoặc điều chỉnh giảm. */
export function salaryRecordDescription(line: SalaryLine) {
  const teacher = line.teacherName || "giáo viên";
  const period = `T${line.month}/${line.year}`;
  if (line.records.length === 0) {
    return `Lương ${teacher} · ${line.className} ${period} (${line.sharePercent}% học phí đã thu)`;
  }
  return line.difference > 0
    ? `Bổ sung lương ${teacher} · ${line.className} ${period} (học phí thu thêm sau khi chốt)`
    : `Điều chỉnh giảm lương ${teacher} · ${line.className} ${period} (thanh toán bị hoàn/bỏ gán sau khi chốt)`;
}

/**
 * Nhắc admin khi một thanh toán thay đổi ở kỳ đã chốt lương (thu muộn, hoàn tác, bỏ gán):
 * lương kỳ đó cần chốt bổ sung/điều chỉnh ở trang Thu chi. Trả chuỗi rỗng nếu không cần.
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
    ? ` Lớp ${invoice.enrollment.classRoom.name} kỳ T${invoice.month}/${invoice.year} đã chốt lương — vào Thu chi để chốt điều chỉnh.`
    : "";
}
