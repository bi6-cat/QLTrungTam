import { formatMonth } from "@/lib/format";

/**
 * Tin gửi nhóm phụ huynh của lớp: ngắn, đủ ý. Cả lớp cùng số buổi thì ghi luôn số buổi; có buổi
 * lớp nghỉ/học bù tháng trước thì kèm lý do để phụ huynh không thắc mắc vì sao số buổi đổi.
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
  const sessions = sessionCounts.size === 1 ? `${[...sessionCounts][0]} buổi` : "";
  const detail = [sessions, input.adjustmentNote].filter(Boolean).join(", ");
  return [
    `Kính gửi phụ huynh lớp ${input.className},`,
    `Học phí ${formatMonth(input.month, input.year)}${detail ? ` (${detail})` : ""}.`,
    `Xem và thanh toán: ${input.payUrl}`,
    "Chọn tên con, kiểm tra số tiền rồi quét QR (không cần sửa nội dung chuyển khoản). Hệ thống tự xác nhận khi nhận tiền.",
    "Trân trọng, APLUS ACADEMY"
  ].join("\n");
}
