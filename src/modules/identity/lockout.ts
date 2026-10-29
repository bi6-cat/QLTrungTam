// Khoá theo tài khoản (lưu DB) chặn dò PIN 6 số từ nhiều IP; giới hạn theo IP chỉ là lớp thêm.
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;

export function isLocked(lockedUntil: Date | null, now: Date) {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Trạng thái sau một lần sai, từ số lần sai đã cộng dồn (kể cả lần này). Đủ ngưỡng thì khoá và
 * đếm lại từ 0, nên hết khoá được thử thêm một lượt nữa.
 */
export function lockAfterFailure(failedLogins: number, now: Date) {
  if (failedLogins < MAX_FAILED_LOGINS) return null;
  return { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) };
}

export function minutesUntil(lockedUntil: Date, now: Date) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000));
}
