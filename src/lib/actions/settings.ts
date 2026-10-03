"use server";

import { revalidatePath } from "next/cache";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireAdmin } from "@/lib/auth";
import { getAppSettings, saveAppSettings } from "@/lib/settings";
import { safeParseForm, updateSettingsSchema } from "@/lib/validation";

export async function updateSettingsAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateSettingsSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    // Trang cài đặt không gửi secret thật xuống trình duyệt: ô để trống nghĩa là giữ nguyên.
    const current = await getAppSettings();
    await saveAppSettings({
      ...data,
      sepayApiKey: data.sepayApiKey || current.sepayApiKey,
      sepayWebhookSecret: data.sepayWebhookSecret || current.sepayWebhookSecret
    });
  } catch (saveError) {
    console.error("Không lưu được cài đặt.", saveError);
    return errorState("Không lưu được cài đặt. Vui lòng tải lại trang và thử lại.");
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin/debts");
  revalidatePath("/pay/[short_code]", "page");
  return successState("Đã lưu cài đặt.");
}
