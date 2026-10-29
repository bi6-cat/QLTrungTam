"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import { changePasswordSchema, safeParseForm } from "@/lib/validation";
import { changeTeacherPassword, IdentityError, requireTeacher, startPortalSession } from "@/modules/identity";

export async function changeTeacherPasswordAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const teacher = await requireTeacher();
  const { data, error } = safeParseForm(changePasswordSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    const version = await changeTeacherPassword(teacher.id, data.currentPassword, data.newPassword);
    // Phiên này nhận cookie mang số mới nên vẫn đăng nhập; thiết bị khác bị đăng xuất.
    await startPortalSession("teacher", teacher.id, version);
    return successState("Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.");
  } catch (changeError) {
    if (changeError instanceof IdentityError) return errorState(changeError.message);
    console.error("Không đổi được mật khẩu giáo viên.", changeError);
    return errorState("Không đổi được mật khẩu. Vui lòng tải lại trang và thử lại.");
  }
}
