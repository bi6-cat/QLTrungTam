export async function register() {
  // Chỉ chạy trên máy chủ Node (không chạy ở edge runtime của middleware).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSheetSyncScheduler } = await import("@/lib/sheet-sync-scheduler");
  startSheetSyncScheduler();
}
