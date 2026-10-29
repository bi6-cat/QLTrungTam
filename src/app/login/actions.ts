"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit, recordFailure, resetLimit } from "@/modules/core";
import {
  authenticateStudent,
  authenticateTeacher,
  endPortalSession,
  minutesUntil,
  startPortalSession,
  type AuthResult
} from "@/modules/identity";

// Giới hạn theo IP chỉ đếm lần sai. Cả lớp học dùng chung wifi trung tâm (cùng IP) nên ngưỡng
// của học sinh rộng hơn; chặn dò PIN chủ yếu nhờ khoá theo tài khoản trong DB.
const TEACHER_IP_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };
const STUDENT_IP_LIMIT = { max: 40, windowMs: 15 * 60 * 1000 };

async function clientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}

function failureMessage(result: Exclude<AuthResult, { ok: true }>, invalidMessage: string) {
  if (result.reason === "locked") {
    return `Tài khoản tạm khoá vì nhập sai nhiều lần. Thử lại sau ${minutesUntil(result.lockedUntil, new Date())} phút hoặc nhờ trung tâm mở khoá.`;
  }
  return invalidMessage;
}

export async function teacherLoginAction(_prev: { error: string }, formData: FormData) {
  const key = `teacher-login:${await clientIp()}`;
  const limit = checkRateLimit(key, TEACHER_IP_LIMIT);
  if (!limit.allowed) return { error: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${limit.retryAfterSec} giây.` };

  const username = String(formData.get("username") ?? "").slice(0, 100);
  const password = String(formData.get("password") ?? "").slice(0, 200);
  const result = await authenticateTeacher(username, password);
  if (!result.ok) {
    recordFailure(key, TEACHER_IP_LIMIT);
    return { error: failureMessage(result, "Sai tên đăng nhập hoặc mật khẩu.") };
  }
  resetLimit(key);
  await startPortalSession("teacher", result.sub, result.ver);
  redirect("/teacher");
}

export async function studentLoginAction(_prev: { error: string }, formData: FormData) {
  const key = `student-login:${await clientIp()}`;
  const limit = checkRateLimit(key, STUDENT_IP_LIMIT);
  if (!limit.allowed) return { error: `Bạn đã thử quá nhiều lần. Vui lòng thử lại sau ${limit.retryAfterSec} giây.` };

  const code = String(formData.get("code") ?? "").slice(0, 20);
  const pin = String(formData.get("pin") ?? "").slice(0, 20);
  const result = await authenticateStudent(code, pin);
  if (!result.ok) {
    recordFailure(key, STUDENT_IP_LIMIT);
    return { error: failureMessage(result, "Sai mã học sinh hoặc mã PIN.") };
  }
  // Không xoá bộ đếm IP khi đúng: IP dùng chung cả lớp, một bạn đăng nhập được không xoá lần sai của người khác.
  await startPortalSession("student", result.sub, result.ver);
  redirect("/learn");
}

export async function teacherLogoutAction() {
  await endPortalSession("teacher");
  redirect("/login?as=teacher");
}

export async function studentLogoutAction() {
  await endPortalSession("student");
  redirect("/login?as=student");
}
