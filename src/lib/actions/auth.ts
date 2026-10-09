"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { login, logout, requireStaff } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, recordFailure, resetLimit } from "@/lib/rate-limit";
import { changePasswordSchema, loginSchema, safeParseForm } from "@/lib/validation";

const LOGIN_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };

async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

export async function loginAction(_prevState: { error: string }, formData: FormData) {
  const ip = await getClientIp();
  const rlKey = `login:${ip}`;
  const limit = checkRateLimit(rlKey, LOGIN_LIMIT);
  if (!limit.allowed) {
    return {
      error: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${limit.retryAfterSec} giây.`
    };
  }

  const { data, error } = safeParseForm(loginSchema, formData);
  if (error || !data) {
    recordFailure(rlKey, LOGIN_LIMIT);
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };
  }
  const ok = await login(data.username, data.password);
  if (!ok) {
    recordFailure(rlKey, LOGIN_LIMIT);
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };
  }
  resetLimit(rlKey);
  redirect("/admin");
}

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
