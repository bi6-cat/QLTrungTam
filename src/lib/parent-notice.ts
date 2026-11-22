import { formatMonth } from "@/lib/format";

/** Dòng lý do trong tin nhắn: `[lý do]`; rỗng nếu không có lý do. */
export function reasonLine(reason: string) {
  const text = reason.trim();
  return text ? `[${text}]` : "";
}

/**
 * Tin gửi nhóm phụ huynh của lớp: ngắn, đủ ý. Cả lớp cùng số buổi thì ghi luôn số buổi; có buổi
 * lớp nghỉ/học bù tháng trước thì kèm lý do (dòng riêng trong ngoặc vuông) để phụ huynh không
 * thắc mắc vì sao số buổi đổi.
 */
export function buildParentNotice(input: {
  className: string;
  payUrl: string;
  month: number;
  year: number;
  rows: Array<{ status: string; sessions: number }>;
  adjustmentNote: string;
}) {
  const billed = input.rows.filter((row) => row.status === "unpaid" || row.status === "paid" || row.status === "not_created");
  const sessionCounts = new Set(billed.map((row) => row.sessions));
  const sessionsLine = sessionCounts.size === 1 ? `Tổng số buổi T${input.month} dự kiến: ${[...sessionCounts][0]} buổi` : "";
  return [
    `Thông báo học phí ${formatMonth(input.month, input.year)}`,
    `Kính gửi phụ huynh lớp ${input.className}, @All`,
    sessionsLine,
    reasonLine(input.adjustmentNote),
    `Xem và thanh toán: ${input.payUrl}`,
    "Chọn tên, kiểm tra số tiền rồi quét QR (không cần sửa nội dung chuyển khoản). Hệ thống tự xác nhận khi nhận tiền."
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Đổi lý do trong tin đang soạn mà không đụng phần người dùng đã sửa tay: thay đúng dòng lý do
 * cũ; tin chưa có lý do thì chèn ngay trước dòng "Xem và thanh toán". Dòng cũ đã bị người dùng
 * sửa/xoá tay hoặc không tìm được chỗ chèn thì giữ nguyên tin.
 */
export function swapReasonLine(message: string, oldReason: string, newReason: string) {
  const oldLine = reasonLine(oldReason);
  const newLine = reasonLine(newReason);
  if (oldLine === newLine) return message;

  const lines = message.split("\n");
  if (oldLine) {
    const at = lines.indexOf(oldLine);
    if (at < 0) return message; // người dùng đã tự xoá/sửa dòng này, không đoán thay
    if (newLine) lines[at] = newLine;
    else lines.splice(at, 1);
    return lines.join("\n");
  }

  const payAt = lines.findIndex((line) => line.startsWith("Xem và thanh toán"));
  if (payAt < 0) return message;
  lines.splice(payAt, 0, newLine);
  return lines.join("\n");
}
