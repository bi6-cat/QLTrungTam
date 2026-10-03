import { CENTER_INFO } from "@/lib/center";
import { absoluteUrl, payPath } from "@/lib/class-links";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { DEFAULT_DEBT_REMINDER_TEMPLATE } from "@/lib/settings";

export type DebtInvoice = {
  id: string;
  month: number;
  year: number;
  amount: number;
  memoContent: string;
  className: string;
  classShortCode: string;
  payUrl: string;
  monthsOverdue: number;
};

export type DebtRow = {
  studentId: string;
  studentName: string;
  phone: string;
  parentName: string | null;
  studentArchived: boolean;
  invoices: DebtInvoice[];
  /** Các lớp học sinh đang nợ, không lặp lại, theo thứ tự khoản nợ cũ nhất trước. */
  classes: Array<{ name: string; shortCode: string }>;
  totalAmount: number;
  /** Số tháng của khoản nợ cũ nhất so với tháng hiện tại; 0 = nợ tháng này. */
  oldestOverdue: number;
  /** Link nộp học phí của lớp có khoản nợ cũ nhất. */
  primaryPayUrl: string;
};

export type DebtSummary = {
  rows: DebtRow[];
  totalAmount: number;
  studentCount: number;
  invoiceCount: number;
  overdueStudentCount: number;
  overdueAmount: number;
};

function monthIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

/**
 * Toàn bộ công nợ chưa thu, gom theo học sinh và cộng dồn qua mọi tháng.
 *
 * Hóa đơn đã hủy/miễn không phải công nợ nên bị loại; học sinh đã lưu trữ vẫn
 * giữ lại vì tiền vẫn phải đòi, chỉ đánh dấu để hiển thị khác đi.
 */
export async function getOutstandingDebts(options?: {
  classId?: string;
  appUrl?: string;
}): Promise<DebtSummary> {
  const now = new Date();
  const currentIndex = monthIndex(now.getMonth() + 1, now.getFullYear());
  const baseUrl = (options?.appUrl ?? "").replace(/\/$/, "");

  const invoices = await prisma.monthlyInvoice.findMany({
    where: {
      status: "unpaid",
      ...(options?.classId ? { enrollment: { classId: options.classId } } : {})
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    select: {
      id: true,
      month: true,
      year: true,
      amount: true,
      memoContent: true,
      classNameSnapshot: true,
      classShortCodeSnapshot: true,
      enrollment: {
        select: {
          student: {
            select: { id: true, fullName: true, phone: true, parentName: true, archivedAt: true }
          },
          classRoom: { select: { name: true, shortCode: true, publicToken: true } }
        }
      }
    }
  });

  const byStudent = new Map<string, DebtRow>();
  for (const invoice of invoices) {
    const student = invoice.enrollment.student;
    const classRoom = invoice.enrollment.classRoom;
    const payUrl = baseUrl ? absoluteUrl(baseUrl, payPath(classRoom)) : "";
    const overdue = Math.max(0, currentIndex - monthIndex(invoice.month, invoice.year));

    const row =
      byStudent.get(student.id) ??
      ({
        studentId: student.id,
        studentName: student.fullName,
        phone: student.phone,
        parentName: student.parentName,
        studentArchived: Boolean(student.archivedAt),
        invoices: [],
        classes: [],
        totalAmount: 0,
        oldestOverdue: 0,
        primaryPayUrl: payUrl
      } satisfies DebtRow);

    row.invoices.push({
      id: invoice.id,
      month: invoice.month,
      year: invoice.year,
      amount: invoice.amount,
      memoContent: invoice.memoContent,
      className: invoice.classNameSnapshot ?? classRoom.name,
      classShortCode: invoice.classShortCodeSnapshot ?? classRoom.shortCode,
      payUrl,
      monthsOverdue: overdue
    });
    row.totalAmount += invoice.amount;
    const className = invoice.classNameSnapshot ?? classRoom.name;
    const classShortCode = invoice.classShortCodeSnapshot ?? classRoom.shortCode;
    if (!row.classes.some((item) => item.shortCode === classShortCode)) {
      row.classes.push({ name: className, shortCode: classShortCode });
    }
    if (overdue > row.oldestOverdue) {
      row.oldestOverdue = overdue;
      row.primaryPayUrl = payUrl;
    }
    byStudent.set(student.id, row);
  }

  // Mặc định nợ lâu nhất lên đầu, cùng mức thì số tiền lớn hơn lên trước.
  const rows = sortDebtRows([...byStudent.values()], "oldest");
  return { rows, ...summarizeDebtRows(rows) };
}

export type DebtSort = "oldest" | "newest" | "amount" | "name";

export const DEBT_SORTS: Array<{ value: DebtSort; label: string }> = [
  { value: "oldest", label: "Nợ lâu nhất trước" },
  { value: "newest", label: "Tháng gần nhất trước" },
  { value: "amount", label: "Nợ nhiều tiền nhất" },
  { value: "name", label: "Tên học sinh A→Z" }
];

export function parseDebtSort(value: string | undefined): DebtSort {
  return DEBT_SORTS.some((item) => item.value === value) ? (value as DebtSort) : "oldest";
}

export type DebtPeriod = {
  key: string;
  month: number;
  year: number;
  amount: number;
  invoiceCount: number;
  studentCount: number;
};

export function debtPeriodKey(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2026-09" → { month: 9, year: 2026 }; sai định dạng → null. */
export function parseDebtPeriod(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { month, year } : null;
}

/** Tổng nợ theo từng tháng học phí, tháng gần nhất trước. */
export function summarizeDebtPeriods(rows: DebtRow[]): DebtPeriod[] {
  const periods = new Map<string, DebtPeriod & { students: Set<string> }>();
  for (const row of rows) {
    for (const invoice of row.invoices) {
      const key = debtPeriodKey(invoice.month, invoice.year);
      const period =
        periods.get(key) ??
        { key, month: invoice.month, year: invoice.year, amount: 0, invoiceCount: 0, studentCount: 0, students: new Set<string>() };
      period.amount += invoice.amount;
      period.invoiceCount += 1;
      period.students.add(row.studentId);
      periods.set(key, period);
    }
  }
  return [...periods.values()]
    .map(({ students, ...period }) => ({ ...period, studentCount: students.size }))
    .sort((a, b) => monthIndex(b.month, b.year) - monthIndex(a.month, a.year));
}

/**
 * Chỉ giữ các khoản nợ của một tháng (tổng và mức quá hạn tính lại theo tháng đó). Tin nhắc nợ
 * vẫn nên dựng từ dòng đầy đủ để phụ huynh thấy hết các khoản.
 */
export function filterDebtRowsByPeriod(rows: DebtRow[], period: { month: number; year: number }): DebtRow[] {
  return rows.flatMap((row) => {
    const invoices = row.invoices.filter(
      (invoice) => invoice.month === period.month && invoice.year === period.year
    );
    if (invoices.length === 0) return [];
    return [
      {
        ...row,
        invoices,
        classes: row.classes.filter((classRoom) =>
          invoices.some((invoice) => invoice.classShortCode === classRoom.shortCode)
        ),
        totalAmount: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
        oldestOverdue: Math.max(...invoices.map((invoice) => invoice.monthsOverdue))
      }
    ];
  });
}

export function sortDebtRows(rows: DebtRow[], sort: DebtSort): DebtRow[] {
  const newestIndex = (row: DebtRow) => Math.max(...row.invoices.map((invoice) => monthIndex(invoice.month, invoice.year)));
  const collator = new Intl.Collator("vi");
  return [...rows].sort((left, right) => {
    switch (sort) {
      case "newest":
        return newestIndex(right) - newestIndex(left) || right.totalAmount - left.totalAmount;
      case "amount":
        return right.totalAmount - left.totalAmount || right.oldestOverdue - left.oldestOverdue;
      case "name":
        return collator.compare(left.studentName, right.studentName);
      default:
        return right.oldestOverdue - left.oldestOverdue || right.totalAmount - left.totalAmount;
    }
  });
}

export function summarizeDebtRows(rows: DebtRow[]) {
  const overdueRows = rows.filter((row) => row.oldestOverdue > 0);
  return {
    totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    studentCount: rows.length,
    invoiceCount: rows.reduce((sum, row) => sum + row.invoices.length, 0),
    overdueStudentCount: overdueRows.length,
    overdueAmount: overdueRows.reduce(
      (sum, row) =>
        sum + row.invoices.filter((invoice) => invoice.monthsOverdue > 0).reduce((total, invoice) => total + invoice.amount, 0),
      0
    )
  };
}

/**
 * Tin nhắn nhắc nợ dán thẳng vào Zalo.
 *
 * Cố ý viết sẵn toàn bộ nội dung thay vì tích hợp Zalo OA: trung tâm nhỏ nhắn
 * tay bằng tài khoản cá nhân, chỉ cần copy là xong, không tốn phí và không phải
 * chờ duyệt ứng dụng.
 */
export function buildReminderMessage(
  row: DebtRow,
  template = DEFAULT_DEBT_REMINDER_TEMPLATE
) {
  const debtDetails = row.invoices.map((invoice) => {
    const overdueNote = invoice.monthsOverdue > 0 ? ` — quá hạn ${invoice.monthsOverdue} tháng` : "";
    return `• ${formatMonth(invoice.month, invoice.year)} · ${invoice.className}: ${formatCurrency(invoice.amount)}${overdueNote}`;
  }).join("\n");
  const paymentSection = row.primaryPayUrl
    ? [
        "Phụ huynh vui lòng thanh toán tại link sau:",
        row.primaryPayUrl,
        "(Chọn tên con, quét mã QR rồi chuyển khoản — không cần sửa nội dung chuyển khoản)"
      ].join("\n")
    : "";
  const values: Record<string, string> = {
    studentName: row.studentName,
    parentName: row.parentName ?? "",
    debtDetails,
    totalAmount: formatCurrency(row.totalAmount),
    payUrl: row.primaryPayUrl,
    paymentSection,
    centerName: CENTER_INFO.name,
    centerPhone: CENTER_INFO.phone
  };

  return Object.entries(values)
    .reduce(
      (message, [key, value]) => message.split(`{{${key}}}`).join(value),
      template
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Link mở cửa sổ chat Zalo với số phụ huynh. */
export function buildZaloLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const international = digits.startsWith("0") ? `84${digits.slice(1)}` : digits;
  return `https://zalo.me/${international}`;
}
