// Khoá theo tài khoản (lưu DB) chặn dò mật khẩu/PIN từ nhiều IP; giới hạn theo IP là lớp thêm.
export const MAX_FAILED_LOGINS = 5;
// Mã học sinh dạng tên ("HuongNV02") đoán được, nên ngưỡng khoá cả tài khoản cao hơn nhiều để bạn
// khác không cố tình gõ sai cho khoá được; chặn chính là giới hạn 5 lần sai theo (mã, IP) ở lớp
// đăng nhập. 30 lần/15 phút vẫn khiến dò PIN 6 số từ nhiều IP mất hàng năm.
export const STUDENT_MAX_FAILED_LOGINS = 30;
export const LOCK_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date) {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Trạng thái sau một lần sai, từ số lần sai đã cộng dồn (kể cả lần này). Đủ ngưỡng thì khoá và
 * đếm lại từ 0, nên hết khoá được thử thêm một lượt nữa.
 */
export function lockAfterFailure(failedLogins: number, now: Date, maxFailures = MAX_FAILED_LOGINS) {
  if (failedLogins < maxFailures) return null;
  return { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
}

export function minutesUntil(lockedUntil: Date, now: Date) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}
