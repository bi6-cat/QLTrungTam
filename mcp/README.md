# MCP server cho QLTrungTam

Cho Claude (Claude Code / VS Code / Claude Desktop) tra cứu và hỗ trợ quản lý trung tâm: công nợ,
tài chính, soạn thông báo thu tiền để dán vào nhóm Zalo, và dọn hồ sơ học sinh.

Server chạy bằng Docker (máy không cần Node.js), nói chuyện với Claude qua stdio và đọc/ghi thẳng
PostgreSQL bằng Prisma, dùng lại code trong `src/lib` nên số liệu khớp với app.

## Cài đặt (làm một lần, trên mỗi máy)

Cần: Docker, bản clone repo này, và file `.pem` nếu nối DB trên EC2.

1. `cp mcp/.env.example mcp/.env.local`, rồi điền `DATABASE_URL`, `SSH_KEY`... (xem chú thích trong file).
   Lấy thông tin DB trên server (tự chạy, đừng dán vào chat):
   `ssh -i <pem> ubuntu@<host> 'grep -E "^(POSTGRES_USER|POSTGRES_DB|DB_PASSWORD)=" /opt/QLTrungTam/.env'`
2. Mở thư mục repo bằng Claude Code. File [.mcp.json](../.mcp.json) khai báo sẵn server `qltrungtam`;
   Claude Code sẽ hỏi cho phép lần đầu (hoặc `/mcp` để kiểm tra trạng thái).
3. Lần đầu script tự build image `qltrungtam-mcp` (vài phút). Build lại sau khi sửa code trong `mcp/`
   hoặc `src/lib`: `docker build -f mcp/Dockerfile -t qltrungtam-mcp .`

Đổi sang máy khác: chỉ cần lặp lại 3 bước trên (clone repo, copy `.pem`, tạo `mcp/.env.local`).

## Kết nối tới DB trên server

DB của stack production/staging không mở cổng ra ngoài. `mcp/run.sh` khi có `SSH_HOST` sẽ:
SSH vào server lấy IP container `qltrungtam-db-1` (đổi bằng `DB_CONTAINER`), mở tunnel
`127.0.0.1:<cổng trong DATABASE_URL> → container:5432`, chạy MCP, và đóng tunnel khi Claude thoát.
Không sửa gì trên server, cũng không lưu mật khẩu nào ngoài `mcp/.env.local` của bạn.

## Các tool

Đọc (luôn bật):

| Tool | Dùng để |
|---|---|
| `center_overview` | Tổng quan tháng: phải thu/đã thu/còn lại, công nợ tích luỹ, cảnh báo cần xử lý |
| `list_classes`, `get_class` | Lớp, lịch học, link nộp học phí, học sinh + hoá đơn của tháng |
| `search_students`, `get_student` | Tìm theo tên (không dấu cũng được) hoặc SĐT; hồ sơ + lịch sử hoá đơn |
| `list_debts` | Ai còn nợ: lọc theo lớp, tháng nợ, số tháng quá hạn; tổng nợ theo tháng |
| `list_transactions` | Giao dịch chưa khớp hoá đơn (cần đối soát tay) hoặc giao dịch trong tháng |
| `monthly_finance`, `finance_trend` | Lãi/lỗ theo kỳ, lương GV, chi phí, dòng tiền; xu hướng N tháng |
| `find_duplicate_students` | Hồ sơ trùng: cùng tên+SĐT, tên gần giống, cùng SĐT học chung lớp |
| `find_student_anomalies` | SĐT sai định dạng/số tạm, tên lạ, thiếu thông tin, lưu trữ nhưng vẫn học/còn nợ |
| `recent_mcp_changes` | Nhật ký mọi thay đổi do MCP thực hiện, kèm dữ liệu trước/sau |

Soạn nội dung Zalo (chỉ trả văn bản để bạn chép và dán, **không gửi**; Zalo không có API chính thức
gửi vào nhóm cá nhân):

| Tool | Dùng để |
|---|---|
| `compose_group_debt_notice` | Nhắc nợ cả lớp trong nhóm Zalo: danh sách em còn nợ + link nộp của lớp. Chọn mức riêng tư `names_amounts` / `names_only` / `summary_only` |
| `compose_tuition_notice` | Thông báo học phí đầu tháng (số buổi, số tiền/em, hạn đóng, link) |
| `compose_personal_reminder` | Tin nhắc nợ riêng một phụ huynh, theo mẫu trong Cài đặt của app, kèm link chat Zalo |

Ghi hồ sơ học sinh (chỉ có khi `MCP_ALLOW_WRITE=true`):

| Tool | Hành vi |
|---|---|
| `create_student` | Thêm hồ sơ; chặn trùng tên+SĐT, cảnh báo trùng SĐT (cùng quy tắc với app) |
| `update_student` | Sửa từng trường, kiểm tra lại bằng schema của app, chặn nếu thành bản trùng |
| `archive_student` / `restore_student` | Lưu trữ / khôi phục (không mất dữ liệu). Cách chuẩn để bỏ hồ sơ trùng |
| `delete_student` | Xoá vĩnh viễn, **chỉ khi chưa từng ghi danh lớp nào**; cần `confirm: true` và lý do |

## An toàn

- Không có tool nào đụng tới tiền: không tạo/sửa hoá đơn, giao dịch, lương, chi phí, không ghi danh lớp.
- Mọi lần ghi đều có dòng trong `AuditLog` (tác nhân `claude-mcp`, kèm dữ liệu trước/sau; xoá thì lưu
  toàn bộ hồ sơ) để dựng lại khi cần. Xem bằng tool `recent_mcp_changes`.
- Thông báo nhóm có tên và số tiền của nhiều gia đình; mặc định hiện cả hai. Dùng `names_only` hoặc
  `summary_only` nếu muốn kín hơn.
- Trước khi ghi, hãy để Claude nêu rõ thay đổi và xác nhận với bạn. Với DB thật, nên chạy
  `find_*` trước, xem kết quả, rồi mới cho sửa từng hồ sơ.

## Phát triển

- Logic thuần (phát hiện trùng/bất thường, soạn thông báo) nằm ở `student-checks.ts` và
  `announcements.ts`, có test trong [tests/mcp.test.ts](../tests/mcp.test.ts) (`npm run test:unit`).
- stdout chỉ dành cho giao thức MCP; log phải đi qua `console.error`.
- Thêm tool mới: đăng ký trong `tools-*.ts`; tool ghi phải nằm trong `registerStudentWriteTools`
  (hoặc hàm tương tự chỉ gọi khi `ALLOW_WRITE`).
