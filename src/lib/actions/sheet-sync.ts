"use server";

import { revalidatePath } from "next/cache";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireAdmin } from "@/lib/auth";
import { extractSpreadsheetId, listSheetTabs, parseServiceAccount } from "@/lib/google-sheets";
import { getSheetSyncConfig, runSheetSync, saveSheetSyncConfig } from "@/lib/sheet-sync";

/** Lưu link Google Sheet và key Service Account; chỉ lưu khi đã mở được file. */
export async function saveSheetSyncConfigAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const spreadsheetId = extractSpreadsheetId(String(formData.get("spreadsheet") ?? ""));
  if (!spreadsheetId) return errorState("Link Google Sheet không hợp lệ. Dán link dạng https://docs.google.com/spreadsheets/d/...");

  try {
    // Không gửi key thật xuống trình duyệt: ô để trống nghĩa là giữ key đã lưu.
    const submittedKey = String(formData.get("serviceAccount") ?? "").trim();
    const serviceAccountJson = submittedKey || (await getSheetSyncConfig()).serviceAccountJson;
    if (!serviceAccountJson) return errorState("Dán nội dung file key JSON của Service Account.");
    const account = parseServiceAccount(serviceAccountJson);
    const spreadsheet = await listSheetTabs(account, spreadsheetId);
    await saveSheetSyncConfig({ spreadsheetId, serviceAccountJson });
    revalidatePath("/admin/settings");
    return successState(`Đã kết nối file “${spreadsheet.title}”.`);
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Không kết nối được Google Sheet.");
  }
}

export async function runSheetSyncAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const scope = formData.get("scope") === "all" ? "all" : "recent";
  try {
    const result = await runSheetSync("manual", scope);
    return successState(`Đã đồng bộ ${result.months} tháng lên “${result.title}”.`);
  } catch (error) {
    return errorState(error instanceof Error ? error.message : "Không đồng bộ được Google Sheet.");
  } finally {
    revalidatePath("/admin/settings");
  }
}
