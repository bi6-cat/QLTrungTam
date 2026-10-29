import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { resolveStudentSession, resolveTeacherSession } from "./authenticate";
import { decodePortalToken, encodePortalToken, PORTAL_COOKIE, PORTAL_MAX_AGE_SECONDS, type PortalKind } from "./portal-token";

export async function startPortalSession(kind: PortalKind, sub: string, ver: number) {
  const cookieStore = await cookies();
  cookieStore.set(
    PORTAL_COOKIE[kind],
    encodePortalToken(kind, { sub, ver, exp: Date.now() + PORTAL_MAX_AGE_SECONDS[kind] * 1000 }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: PORTAL_MAX_AGE_SECONDS[kind],
      path: "/"
    }
  );
}

export async function endPortalSession(kind: PortalKind) {
  const cookieStore = await cookies();
  cookieStore.delete(PORTAL_COOKIE[kind]);
}

async function readPortalSession(kind: PortalKind) {
  const cookieStore = await cookies();
  return decodePortalToken(kind, cookieStore.get(PORTAL_COOKIE[kind])?.value);
}

/** Đọc lại từ DB mỗi request (`cache` gộp các lần gọi trong một request). */
export const getCurrentTeacher = cache(async () => resolveTeacherSession(await readPortalSession("teacher")));
export const getCurrentStudent = cache(async () => resolveStudentSession(await readPortalSession("student")));

/** Gọi ở đầu mọi trang và server action của cổng giáo viên, không chỉ ở layout. */
export async function requireTeacher() {
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/login?as=teacher");
  return teacher;
}

/** Gọi ở đầu mọi trang và server action của cổng học sinh, không chỉ ở layout. */
export async function requireStudent() {
  const student = await getCurrentStudent();
  if (!student) redirect("/login?as=student");
  return student;
}
