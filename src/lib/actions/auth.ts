"use server";

import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { logout, requireStaff } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { changePasswordSchema, safeParseForm } from "@/lib/validation";

export async function logoutAction() {
  await logout();
  redirect("/login");
}

// Mỗi tài khoản (kể cả quản lý phụ) tự đổi mật khẩu của chính mình.
export async function changePasswordAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const session = await requireStaff();
  const { data, error } = safeParseForm(changePasswordSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!user || !verifyPassword(data.currentPassword, user.passwordHash)) {
    return errorState("Mật khẩu hiện tại không đúng.");
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(data.newPassword) }
  });
  return successState("Đã đổi mật khẩu thành công.");
}
