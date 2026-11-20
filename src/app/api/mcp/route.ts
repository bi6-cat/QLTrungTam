import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isAuthorizedMcpRequest } from "@/lib/mcp/auth";
import { createCenterMcpServer } from "@/lib/mcp/server";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Giới hạn trong bộ nhớ (1 instance): đủ cho Claude dùng bình thường, chặn vòng lặp gọi liên tục
// và dò token.
const CALL_LIMIT = { max: 120, windowMs: 60_000 };
const BAD_TOKEN_LIMIT = { max: 20, windowMs: 15 * 60_000 };

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function tooMany(retryAfterSec: number) {
  return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}

/**
 * Endpoint MCP cho Claude (Streamable HTTP, stateless): https://<domain>/api/mcp
 * Mỗi request tạo server + transport mới; không giữ phiên trong bộ nhớ.
 */
async function handle(request: Request) {
  const ip = clientIp(request);
  // Một dòng log mỗi request (không có token) để chẩn đoán kết nối từ Claude.
  const logLine = (status: number, note = "") =>
    console.info(`[mcp] ${request.method} ${status} ip=${ip} auth=${request.headers.has("authorization") ? "header" : new URL(request.url).searchParams.has("key") ? "query" : "none"}${note}`);

  // Request có token đúng không bao giờ bị chặn bởi bộ đếm sai token: Claude dò kết nối không kèm
  // token (khi thêm connector) cũng đi từ cùng IP của Anthropic.
  const authorized = isAuthorizedMcpRequest(request);
  const badTokenKey = `mcp-auth:${ip}`;
  if (!authorized) {
    const badToken = checkRateLimit(badTokenKey, BAD_TOKEN_LIMIT);
    if (!badToken.allowed) {
      logLine(429, " bad-token-limit");
      return tooMany(badToken.retryAfterSec);
    }
    recordFailure(badTokenKey, BAD_TOKEN_LIMIT);
    logLine(401);
    return new Response("Unauthorized", { status: 401 });
  }

  const calls = checkRateLimit("mcp-calls", CALL_LIMIT);
  if (!calls.allowed) {
    logLine(429, " call-limit");
    return tooMany(calls.retryAfterSec);
  }
  recordFailure("mcp-calls", CALL_LIMIT);

  const server = createCenterMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    logLine(response.status);
    return response;
  } finally {
    // Với enableJsonResponse, response đã đủ khi handleRequest trả về.
    void transport.close();
    void server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
