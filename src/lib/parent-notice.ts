const BULLET = "• ";
const SESSIONS_PREFIX = `${BULLET}Số buổi tháng `;
const PAY_PREFIX = `${BULLET}Link thanh toán: `;

/** "K26 - Tiếng Anh 10" -> "K26 TIẾNG ANH 10" cho dòng tiêu đề viết hoa. */
function headingClassName(className: string) {
  return className.trim().replace(/\s+[-–]\s+/g, " ").toLocaleUpperCase("vi");
}

/** Phần lý do gắn sau số buổi: ` (lý do)`; rỗng nếu không có lý do. */
function reasonSuffix(reason: string) {
  const text = reason.trim();
  return text ? ` (${text})` : "";
}

/** Dòng lý do riêng khi lớp không cùng số buổi (không có dòng số buổi để gắn vào). */
export function reasonLine(reason: string) {
  const text = reason.trim();
  return text ? `${BULLET}Ghi chú: ${text}` : "";
}

/**
 * Tin gửi nhóm phụ huynh của lớp:
 *
 *   THÔNG BÁO HỌC PHÍ THÁNG 11/2026 – LỚP K26 TIẾNG ANH 10
 *
 *   Kính gửi Quý phụ huynh và các em @All,
 *
 *   • Số buổi tháng 11: 7 buổi (đã trừ 2 buổi nghỉ: 09/11 GV bận, 20/11 nghỉ lễ)
 *   • Link thanh toán: https://...
 *
 *   Hướng dẫn: Mở link → Chọn tên học sinh → Kiểm tra số tiền → Quét QR.
 *
 * Cả lớp cùng số buổi mới ghi dòng số buổi (lý do trong ngoặc ngay sau); khác nhau thì lý do thành
 * dòng "Ghi chú" riêng.
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
  const details =
    sessionCounts.size === 1
      ? [`${SESSIONS_PREFIX}${input.month}: ${[...sessionCounts][0]} buổi${reasonSuffix(input.adjustmentNote)}`]
      : [reasonLine(input.adjustmentNote)];
  const month = String(input.month).padStart(2, "0");
  return [
    `THÔNG BÁO HỌC PHÍ THÁNG ${month}/${input.year} – LỚP ${headingClassName(input.className)}`,
    "",
    "Kính gửi Quý phụ huynh và các em @All,",
    "",
    ...details.filter(Boolean),
    `${PAY_PREFIX}${input.payUrl}`,
    "",
    "Hướng dẫn: Mở link → Chọn tên học sinh → Kiểm tra số tiền → Quét QR."
  ].join("\n");
}

/**
 * Đổi lý do trong tin đang soạn mà không đụng phần người dùng đã sửa tay: thay đúng phần lý do cũ
 * (trong ngoặc cuối dòng số buổi, hoặc dòng "Ghi chú"). Tin chưa có lý do thì gắn vào dòng số buổi,
 * không có dòng số buổi thì chèn dòng "Ghi chú" trước dòng link. Phần cũ đã bị sửa/xoá tay hoặc
 * không tìm được chỗ thì giữ nguyên tin.
 */
export function swapReasonLine(message: string, oldReason: string, newReason: string) {
  if (oldReason.trim() === newReason.trim()) return message;
  const lines = message.split("\n");
  const sessionsAt = lines.findIndex((line) => line.startsWith(SESSIONS_PREFIX));

  if (sessionsAt >= 0) {
    const line = lines[sessionsAt];
    const oldSuffix = reasonSuffix(oldReason);
    if (oldSuffix && !line.endsWith(oldSuffix)) return message; // người dùng đã tự sửa phần này
    lines[sessionsAt] = line.slice(0, line.length - oldSuffix.length) + reasonSuffix(newReason);
    return lines.join("\n");
  }

  const oldLine = reasonLine(oldReason);
  const newLine = reasonLine(newReason);
  if (oldLine) {
    const at = lines.indexOf(oldLine);
    if (at < 0) return message;
    if (newLine) lines[at] = newLine;
    else lines.splice(at, 1);
    return lines.join("\n");
  }

  const payAt = lines.findIndex((line) => line.startsWith(PAY_PREFIX));
  if (payAt < 0) return message;
  lines.splice(payAt, 0, newLine);
  return lines.join("\n");
}
