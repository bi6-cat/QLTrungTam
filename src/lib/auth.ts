import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import type { AdminRole } from "@/lib/roles";
import {
  decodeSessionToken,
  encodeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/lib/session-token";

export type StaffUser = { userId: string; username: string; role: AdminRole };

export async function login(username: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    encodeSessionToken({
      userId: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000
    }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/"
    }
  );
  return true;
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSession() {
  const cookieStore = await cookies();
  return decodeSessionToken(cookieStore.get(SESSION_COOKIE_NAME)?.value);
}

/**
 * Người đang đăng nhập, vai trò đọc từ DB (không tin vai trò trong cookie): tài khoản bị xóa
 * hoặc đổi vai trò mất quyền ngay ở request kế tiếp. `cache` gộp các lần gọi trong một request.
 */
export const getCurrentUser = cache(async (): Promise<StaffUser | null> => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.adminUser.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, role: true }
  });
  return user ? { userId: user.id, username: user.username, role: user.role } : null;
});

/**
 * Chỉ chủ trung tâm. Gọi ở đầu MỌI trang admin và server action, không chỉ ở layout: Next.js
 * không chạy lại layout khi chuyển trang nên layout không phải là lớp bảo vệ dữ liệu.
 * Quản lý phụ vào trang/thao tác không được phép thì về trang Tổng quan.
 */
export async function requireAdmin() {
  const user = await requireStaff();
  if (user.role !== "owner") {
    redirect("/admin");
  }
  return user;
}

/** Chủ trung tâm hoặc quản lý phụ; trang/thao tác tự giới hạn thêm theo `role`. */
export async function requireStaff() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Cho route handler (trả 401/403 thay vì redirect): null khi không đủ quyền. */
export async function getAuthorizedUser(roles: readonly AdminRole[]) {
  const user = await getCurrentUser();
  return user && roles.includes(user.role) ? user : null;
}
