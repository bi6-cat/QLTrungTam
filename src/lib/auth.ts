import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import {
  decodeSessionToken,
  encodeSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/lib/session-token";

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
 * Gọi ở đầu MỌI trang admin và server action, không chỉ ở layout: Next.js không chạy
 * lại layout khi chuyển trang nên layout không phải là lớp bảo vệ dữ liệu.
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return session;
}
