import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Tên ghi trong AuditLog cho mọi thay đổi đến từ MCP, để lọc và hoàn tác được. */
export const MCP_ACTOR = "claude-mcp";

/** Bật các tool ghi. Mặc định tắt: chỉ đặt MCP_ALLOW_WRITE=true khi chủ động muốn cho Claude sửa. */
export const ALLOW_WRITE = process.env.MCP_ALLOW_WRITE === "true";

export function json(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * Bọc handler: lỗi nghiệp vụ (Error thường, thông báo tiếng Việt) trả nguyên văn; lỗi Prisma/hạ
 * tầng chỉ ghi log ra stderr (stdout dành riêng cho giao thức MCP) và trả thông báo chung.
 */
export function guarded<Args>(handler: (args: Args) => Promise<CallToolResult>) {
  return async (args: Args): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (error) {
      if (error instanceof Error && !error.name.startsWith("PrismaClient")) {
        return fail(error.message);
      }
      console.error("[mcp] lỗi hạ tầng:", error);
      return fail("Không thể truy cập cơ sở dữ liệu. Kiểm tra kết nối (SSH tunnel/DATABASE_URL) rồi thử lại.");
    }
  };
}

export const monthSchema = z.number().int().min(1).max(12).optional().describe("Tháng 1–12; bỏ trống = tháng hiện tại");
export const yearSchema = z.number().int().min(2000).max(2100).optional().describe("Năm; bỏ trống = năm hiện tại");

export function resolvePeriod(month?: number, year?: number) {
  const now = new Date();
  return { month: month ?? now.getMonth() + 1, year: year ?? now.getFullYear() };
}

export function clampLimit(value: number | undefined, fallback: number, max: number) {
  return Math.min(Math.max(value ?? fallback, 1), max);
}

export function periodLabel(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
