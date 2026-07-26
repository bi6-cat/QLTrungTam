import { CENTER_INFO } from "@/lib/center";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

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
    const payUrl = baseUrl ? `${baseUrl}/pay/${classRoom.publicToken}` : "";
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

  // Nợ lâu nhất lên đầu, cùng mức thì số tiền lớn hơn lên trước.
  const rows = [...byStudent.values()].sort(
    (left, right) => right.oldestOverdue - left.oldestOverdue || right.totalAmount - left.totalAmount
  );

  const overdueRows = rows.filter((row) => row.oldestOverdue > 0);
  return {
    rows,
    totalAmount: rows.reduce((sum, row) => sum + row.totalAmount, 0),
    studentCount: rows.length,
    invoiceCount: invoices.length,
    overdueStudentCount: overdueRows.length,
    overdueAmount: overdueRows.reduce((sum, row) => sum + row.totalAmount, 0)
  };
}

/**
 * Tin nhắn nhắc nợ dán thẳng vào Zalo.
 *
 * Cố ý viết sẵn toàn bộ nội dung thay vì tích hợp Zalo OA: trung tâm nhỏ nhắn
 * tay bằng tài khoản cá nhân, chỉ cần copy là xong, không tốn phí và không phải
 * chờ duyệt ứng dụng.
 */
export function buildReminderMessage(row: DebtRow) {
  const lines = [
    `Kính gửi phụ huynh em ${row.studentName},`,
    "",
    `${CENTER_INFO.name} xin thông báo khoản học phí chưa hoàn thành:`
  ];

  for (const invoice of row.invoices) {
    const overdueNote = invoice.monthsOverdue > 0 ? ` — quá hạn ${invoice.monthsOverdue} tháng` : "";
    lines.push(
      `• ${formatMonth(invoice.month, invoice.year)} · ${invoice.className}: ${formatCurrency(invoice.amount)}${overdueNote}`
    );
  }

  lines.push("", `Tổng cộng: ${formatCurrency(row.totalAmount)}`);

  if (row.primaryPayUrl) {
    lines.push(
      "",
      "Phụ huynh vui lòng thanh toán tại link sau:",
      row.primaryPayUrl,
      "(Chọn tên con, quét mã QR rồi chuyển khoản — không cần sửa nội dung chuyển khoản)"
    );
  }

  lines.push(
    "",
    `Nếu phụ huynh đã chuyển khoản, xin bỏ qua tin nhắn này. Mọi thắc mắc xin liên hệ ${CENTER_INFO.phone}.`,
    "Trân trọng cảm ơn!"
  );

  return lines.join("\n");
}

/** Link mở cửa sổ chat Zalo với số phụ huynh. */
export function buildZaloLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const international = digits.startsWith("0") ? `84${digits.slice(1)}` : digits;
  return `https://zalo.me/${international}`;
}
