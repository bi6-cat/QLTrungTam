import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { prisma } from "@/lib/prisma";
import { registerReadTools } from "./tools-read";
import { registerStudentCheckTools, registerStudentWriteTools } from "./tools-students";
import { ALLOW_WRITE } from "./util";
import { registerZaloTools } from "./tools-zalo";

/**
 * MCP server của hệ thống quản lý trung tâm (stdio). Quy ước:
 * - stdout chỉ dành cho giao thức MCP; mọi log phải đi qua console.error (stderr).
 * - Tool ghi chỉ giới hạn ở hồ sơ học sinh và chỉ bật khi MCP_ALLOW_WRITE=true.
 * - Không có tool nào đụng tới tiền: giao dịch, hoá đơn, lương, chi phí.
 */

if (!process.env.DATABASE_URL) {
  console.error("[mcp] Thiếu DATABASE_URL. Xem mcp/README.md để cấu hình.");
  process.exit(1);
}

const server = new McpServer(
  { name: "qltrungtam", version: "0.1.0" },
  {
    instructions:
      "Trợ lý quản lý trung tâm dạy thêm. Số tiền là VND. Tháng/năm theo giờ Việt Nam. " +
      "Soạn tin Zalo chỉ trả nội dung để người dùng tự dán; không gửi được. " +
      "Trước khi sửa/xoá hồ sơ học sinh hãy nêu rõ thay đổi và hỏi người dùng đồng ý; ưu tiên archive_student hơn delete_student."
  }
);

registerReadTools(server);
registerStudentCheckTools(server);
registerZaloTools(server);
if (ALLOW_WRITE) {
  registerStudentWriteTools(server);
} else {
  console.error("[mcp] Chế độ chỉ đọc (đặt MCP_ALLOW_WRITE=true để bật tool sửa hồ sơ học sinh).");
}

async function shutdown() {
  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.stdin.on("close", shutdown);

server
  .connect(new StdioServerTransport())
  .then(() => console.error(`[mcp] qltrungtam sẵn sàng (${ALLOW_WRITE ? "đọc + ghi hồ sơ học sinh" : "chỉ đọc"}).`))
  .catch((error) => {
    console.error("[mcp] không khởi động được:", error);
    process.exit(1);
  });
