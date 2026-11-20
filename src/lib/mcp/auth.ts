import { createHash, timingSafeEqual } from "node:crypto";
import type { AuditActor } from "@/lib/audit";

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

/**
 * Kiểm tra token MCP. Chấp nhận một trong hai cách (tùy giao diện Claude có mục
 * "Request headers" hay không):
 *   1. Header:  Authorization: Bearer <MCP_API_TOKEN>
 *   2. URL:     https://.../api/mcp?key=<MCP_API_TOKEN>
 * Token trên URL có thể lọt vào access log: Caddy hiện không bật log; nếu bật thì phải che query.
 * Thiếu MCP_API_TOKEN (hoặc ngắn hơn 32 ký tự) thì endpoint tắt hẳn.
 */
export function isAuthorizedMcpRequest(request: Request) {
  const expected = process.env.MCP_API_TOKEN ?? "";
  if (expected.length < 32) return false;

  const header = request.headers.get("authorization") ?? "";
  const fromHeader = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const fromQuery = new URL(request.url).searchParams.get("key") ?? "";
  const provided = fromHeader || fromQuery;
  if (!provided) return false;

  // So sánh hash cố định độ dài để không lộ token qua thời gian phản hồi.
  return timingSafeEqual(digest(provided), digest(expected));
}

/** Người thực hiện ghi vào nhật ký cho mọi thao tác qua MCP. */
export const MCP_ACTOR: AuditActor = { userId: null, username: "claude-mcp" };
