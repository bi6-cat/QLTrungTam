# QL Trung Tâm

Web app quản lý trung tâm dạy thêm và thu học phí bằng VietQR/SePay.

## Chạy nhanh bằng Docker

Máy host không cần cài Node.js.

```bash
docker compose -f docker-compose.dev.yml up
```

Lần đầu container `app` sẽ:

- `npm install`
- `prisma db push`
- seed admin, 3 lớp mẫu, học sinh mẫu và hóa đơn tháng hiện tại
- chạy Next.js dev server tại `http://localhost:3001`

Tài khoản seed:

- Username: `admin`
- Password: `admin123`

## Các đường dẫn chính

- Admin: `http://localhost:3001/admin`
- Đăng nhập: `http://localhost:3001/login`
- Trang phụ huynh mẫu: `http://localhost:3001/pay/L10A`
- Webhook SePay: `POST http://localhost:3001/api/webhook/sepay`

## Test webhook nhanh

Sau khi có hóa đơn chưa đóng với memo `HP L10A 0912345678 T7`, gửi payload mẫu:

```bash
curl -X POST http://localhost:3001/api/webhook/sepay \
  -H "Content-Type: application/json" \
  -d "{\"id\":\"test-001\",\"content\":\"HP L10A 0912345678 T7\",\"amount\":1200000}"
```

Nếu bạn đặt `SEPAY_WEBHOOK_SECRET`, thêm header:

```bash
-H "x-sepay-secret: <secret>"
```

## Biến môi trường

Sao chép `.env.example` thành `.env` nếu cần đổi cấu hình.

- `DATABASE_URL`: PostgreSQL connection string
- `DB_PASSWORD`: mật khẩu Postgres trong Docker
- `ADMIN_USERNAME`: tên đăng nhập admin
- `ADMIN_PASSWORD`: mật khẩu seed nếu chưa có `ADMIN_PASSWORD_HASH`
- `ADMIN_PASSWORD_HASH`: hash dạng `scrypt:<salt>:<hash>`
- `SESSION_SECRET`: khóa ký session cookie
- `SEPAY_API_KEY` / `SEPAY_WEBHOOK_SECRET`: dùng để verify webhook
- `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `BANK_BIN`: thông tin VietQR

## Đã hoàn thành trong MVP

- Next.js App Router + Tailwind + Prisma/Postgres
- Session cookie admin đơn giản
- CRUD lớp học, học sinh, học sinh trong lớp
- Lớp học có trường tên giáo viên
- Tạo hóa đơn theo lớp/tháng, sửa số buổi/đơn giá/số tiền
- Trang phụ huynh `/pay/[short_code]` chọn học sinh, xem QR, poll trạng thái
- Webhook SePay với parse memo và matching invoice
- Trang giao dịch có tổng hợp theo tháng, lịch sử đóng tiền, lịch sử ngân hàng, giao dịch chưa khớp và gán thủ công
- Dashboard tổng quan và export Excel

## Việc nên làm tiếp

- Đổi tài khoản admin và `SESSION_SECRET` trước khi deploy thật
- Xác nhận chính xác format header/payload SePay trong tài khoản live
- Đổi thông tin ngân hàng thật trong `.env`
- Bỏ nút "Đánh dấu đã đóng (test)" trên trang phụ huynh khi lên production
