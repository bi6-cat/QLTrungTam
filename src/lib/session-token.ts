import { createHmac, timingSafeEqual } from "crypto";
import type { AdminRole } from "@/lib/roles";

// Không import next/headers hay prisma ở đây: file này dùng chung cho middleware.

export const SESSION_COOKIE_NAME = "qltt_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

export type SessionPayload = {
  userId: string;
  username: string;
  /** Chỉ dùng để middleware chuyển hướng sớm; quyền thật đọc lại từ DB ở mỗi request. */
  role?: AdminRole;
  exp: number;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SESSION_SECRET chưa được cấu hình (hoặc quá ngắn). Đặt một chuỗi ngẫu nhiên dài trước khi chạy production."
      );
    }
    return "dev-session-secret-change-me";
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function encodeSessionToken(payload: SessionPayload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function decodeSessionToken(token?: string): SessionPayload | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
