/** Đồng hồ đếm ngược khi làm bài: "mm:ss", hoặc "h:mm:ss" nếu còn từ một giờ trở lên. */
export function formatCountdown(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(s / 3600);
  const rest = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return hours > 0 ? `${hours}:${rest}` : rest;
}

/**
 * Số giây còn lại theo giờ máy chủ. `clockOffsetMs` = giờ máy chủ − giờ máy học sinh lúc mở trang,
 * để máy chạy sai giờ không làm đồng hồ lệch.
 */
export function secondsLeft(endsAtMs: number, clockOffsetMs: number, nowMs = Date.now()) {
  return (endsAtMs - (nowMs + clockOffsetMs)) / 1000;
}

/** Khoá localStorage giữ câu trả lời đang làm (tải lại trang hay mất mạng không mất bài). */
export const answerStorageKey = (attemptId: string) => `qltt-quiz-${attemptId}`;
