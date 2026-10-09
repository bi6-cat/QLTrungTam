import { isNightlySyncDue, runSheetSync } from "@/lib/sheet-sync";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const RETRY_AFTER_MS = 60 * 60 * 1000;

/**
 * Hẹn giờ đồng bộ Google Sheet hằng đêm, chạy ngay trong tiến trình Next.js (không cần cron).
 * Cứ 10 phút kiểm tra một lần: qua NIGHTLY_SYNC_HOUR mà hôm nay chưa chạy xong thì chạy, nên
 * máy chủ tắt lúc nửa đêm thì bật lên sẽ tự chạy bù. Lỗi thì 1 giờ sau thử lại.
 */
export function startSheetSyncScheduler() {
  const state = globalThis as typeof globalThis & { __sheetSyncTimer?: ReturnType<typeof setInterval> };
  if (state.__sheetSyncTimer) return;

  let lastAttempt = 0;
  const tick = async () => {
    if (Date.now() - lastAttempt < RETRY_AFTER_MS) return;
    try {
      if (!(await isNightlySyncDue())) return;
      lastAttempt = Date.now();
      const result = await runSheetSync("nightly", "recent");
      console.info(`[sheet-sync] Đã đồng bộ ${result.months} tháng lên Google Sheet.`);
    } catch (error) {
      console.error("[sheet-sync] Đồng bộ hằng đêm thất bại.", error);
    }
  };

  state.__sheetSyncTimer = setInterval(tick, CHECK_INTERVAL_MS);
  state.__sheetSyncTimer.unref?.();
  setTimeout(tick, 60_000).unref?.();
}
