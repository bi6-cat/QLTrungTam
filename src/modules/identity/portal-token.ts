import { decodeScopedToken, encodeScopedToken } from "@/modules/core";

export type PortalKind = "teacher" | "student";

/** Mỗi cổng một cookie riêng, tách hẳn khỏi cookie admin "qltt_session". */
export const PORTAL_COOKIE: Record<PortalKind, string> = {
  teacher: "qltt_teacher",
  student: "qltt_student"
};

export const PORTAL_MAX_AGE_SECONDS: Record<PortalKind, number> = {
  teacher: 60 * 60 * 12,
  student: 60 * 60 * 24 * 7
};

/** sub: id giáo viên hoặc id học sinh; ver: sessionVersion lúc đăng nhập. */
export type PortalSession = { sub: string; ver: number; exp: number };

export function encodePortalToken(kind: PortalKind, session: PortalSession) {
  return encodeScopedToken(`portal:${kind}`, session);
}

export function decodePortalToken(kind: PortalKind, token: string | undefined, now = Date.now()): PortalSession | null {
  const payload = decodeScopedToken(`portal:${kind}`, token);
  if (!payload || typeof payload !== "object") return null;
  const { sub, ver, exp } = payload as Record<string, unknown>;
  if (typeof sub !== "string" || typeof ver !== "number" || typeof exp !== "number") return null;
  if (exp < now) return null;
  return { sub, ver, exp };
}
