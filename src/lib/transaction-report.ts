import { formatMonth } from "@/lib/format";

type ReportTransaction = {
  matchedInvoiceId: string | null;
  matchReason: string | null;
  matchOverrideReason: string | null;
  reversedAt: Date | null;
  reversalReason: string | null;
  resolvedAt: Date | null;
  resolvedNote: string | null;
  matchedInvoice: {
    month: number;
    year: number;
    classShortCodeSnapshot: string | null;
    studentNameSnapshot: string | null;
    enrollment: { classRoom: { shortCode: string }; student: { fullName: string } };
  } | null;
};

/** Trạng thái, hóa đơn khớp và lý do của một giao dịch, dùng chung cho file Excel và Google Sheet. */
export function describeTransaction(transaction: ReportTransaction) {
  const status = transaction.reversedAt
    ? "Đã hoàn tác"
    : transaction.matchedInvoiceId
      ? "Đã khớp"
      : transaction.resolvedAt
        ? "Đã xử lý"
        : "Chưa khớp";
  const matched = transaction.reversedAt
    ? "Liên kết đã được hoàn tác"
    : transaction.matchedInvoice
      ? `${transaction.matchedInvoice.classShortCodeSnapshot ?? transaction.matchedInvoice.enrollment.classRoom.shortCode} · ${transaction.matchedInvoice.studentNameSnapshot ?? transaction.matchedInvoice.enrollment.student.fullName} · ${formatMonth(transaction.matchedInvoice.month, transaction.matchedInvoice.year)}`
      : transaction.matchedInvoiceId
        ? "Liên kết hóa đơn không còn khả dụng"
        : transaction.resolvedAt
          ? "Đã xử lý thủ công (không gán hóa đơn)"
          : "-";
  const reason = transaction.reversedAt
    ? transaction.reversalReason ?? transaction.resolvedNote
    : transaction.matchedInvoiceId
      ? transaction.matchOverrideReason ?? transaction.matchReason
      : transaction.resolvedAt
        ? transaction.resolvedNote
        : transaction.matchReason;
  return { status, matched, reason: reason ?? "-" };
}
