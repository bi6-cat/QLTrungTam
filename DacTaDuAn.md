# Đặc tả dự án: Hệ thống quản lý trung tâm dạy thêm + Thu học phí QR tự động

## 1. Tech stack

| Thành phần | Lựa chọn |
|---|---|
| Framework | Next.js (App Router) — full-stack, 1 service |
| Database | PostgreSQL + Prisma ORM |
| Deploy | Docker Compose: `app` (Next.js) + `db` (Postgres) |
| Thanh toán | SePay (Techcombank) — webhook xác nhận realtime |
| QR | VietQR (qua API SePay hoặc img.vietqr.io) |
| Admin auth | 1 tài khoản admin, session cookie đơn giản (không cần NextAuth phức tạp) |
| Export báo cáo | ExcelJS (xuất .xlsx) |

Quy mô ~10 người dùng đồng thời → không cần cache/queue phức tạp, Postgres + Next.js API routes là đủ.

## 2. Mô hình dữ liệu (Prisma schema - rút gọn)

```
ClassRoom {
  id, name, short_code (unique, dùng trong memo, VD: "L10A")
  price_per_session
  sessions_per_month_default
  created_at
}

Student {
  id, full_name, phone, address, parent_name?, note
  created_at
}

Enrollment {                // học sinh <-> lớp (n-n)
  id, student_id, class_id
  sessions_override?        // null = dùng mặc định của lớp
  status: active | on_leave   // "nghỉ/bảo lưu" -> on_leave bị bỏ qua khi tạo hoá đơn hàng loạt
}

MonthlyInvoice {
  id, enrollment_id
  month, year
  sessions, price_per_session, amount   // snapshot tại thời điểm tạo hoá đơn
  memo_content                          // "HP L10A 0912345678 T8"
  status: unpaid | paid
  paid_at?, transaction_id?
}

Transaction {                // log từ SePay webhook
  id, gateway_ref, amount, raw_content
  transferred_at
  matched_invoice_id?
  raw_payload (json)
}

AdminUser {
  id, username, password_hash
}
```

## 3. Quy tắc memo chuyển khoản

Format: `HP <Mã lớp viết tắt> <SĐT phụ huynh/HS> T<tháng>`
Ví dụ: `HP L10A 0912345678 T8`

- Dễ đọc, dễ gõ tay nếu app lỗi.
- **Có tháng trong memo** → mỗi memo khớp chính xác 1 hoá đơn duy nhất (class + phone + month), không còn tình trạng nhầm lẫn khi phụ huynh nợ nhiều tháng cùng lúc. Nếu phụ huynh nợ 2 tháng, trang nộp học phí sẽ hiện **2 hoá đơn riêng biệt, mỗi hoá đơn 1 QR + memo khác nhau** (VD: `T8`, `T9`) để đóng lần lượt.
- **Lưu ý rủi ro**: nếu 2 học sinh cùng lớp dùng chung 1 SĐT phụ huynh (anh chị em), memo sẽ trùng → hệ thống sẽ cảnh báo "trùng SĐT trong lớp" khi thêm học sinh, và admin cần xử lý thủ công (VD: thêm số cuối tên) cho trường hợp hiếm này.
- Khi webhook nhận về, hệ thống parse content → tách (short_code + phone + tháng) → khớp chính xác 1 hoá đơn + kiểm tra số tiền trùng khớp.

## 4. Luồng nghiệp vụ chính

### 4.1. Admin tạo hoá đơn hàng tháng
1. Đầu tháng, admin vào lớp → bấm "Tạo hoá đơn tháng X/Y"
2. Hệ thống tự tạo `MonthlyInvoice` cho từng học sinh có `status = active` trong lớp (bỏ qua học sinh `on_leave` — nghỉ/bảo lưu) = `price_per_session × (sessions_override hoặc sessions_per_month_default)`
3. Admin có thể sửa tay số buổi/số tiền từng học sinh trước khi hoá đơn được dùng để tạo QR (VD: học sinh nghỉ 1 buổi, học bù...)

### 4.2. Phụ huynh nộp học phí (không cần đăng nhập)
1. Phụ huynh mở link riêng của lớp: `/pay/L10A`
2. Trang hiện danh sách tên học sinh trong lớp → chọn tên con
3. Hệ thống liệt kê **tất cả hoá đơn `unpaid`** của học sinh đó trong lớp (thường chỉ 1, nhưng có thể nhiều nếu nợ từ trước):
   - Nếu không còn hoá đơn unpaid nào → hiện "✅ Đã đóng đầy đủ học phí"
   - Mỗi hoá đơn unpaid hiện riêng: tháng, số tiền, mã VietQR + memo cố định tương ứng (không cho tự nhập tay, tránh sai)
4. Dưới mỗi QR có ghi chú: phụ huynh chỉ cần quét mã QR rồi chuyển khoản, không cần sửa nội dung chuyển khoản
5. Trang tự động poll (mỗi 3-5s) trạng thái từng hoá đơn → khi webhook xác nhận, tự chuyển hoá đơn đó sang "✅ Đã nhận thanh toán" mà không cần refresh

### 4.3. Webhook SePay
1. SePay gọi `/api/webhook/sepay` khi có giao dịch vào tài khoản Techcombank
2. Verify request bằng API Key/secret của SePay
3. Parse `content` → tách short_code + phone + tháng (T8, T9...) → tìm đúng 1 invoice khớp cả 3 trường + kiểm tra `amount` khớp
4. Nếu khớp: set `status = paid`, lưu `transaction_id`, `paid_at`
5. Nếu không khớp (sai cú pháp, số tiền lệch...): vẫn lưu vào `Transaction` với `matched_invoice_id = null` để admin đối soát tay trong dashboard (mục "Giao dịch chưa khớp")

### 4.4. Chặn nộp trùng
- Trước khi generate QR, luôn check lại status invoice mới nhất (không cache) → nếu đã paid thì không hiện QR nữa.
- Vì memo có chứa tháng gián tiếp qua việc chỉ có 1 invoice unpaid tại 1 thời điểm/lớp/học sinh, nên 1 hoá đơn chỉ khớp 1 lần.

## 5. Dashboard Admin

- **Tổng quan**: theo từng lớp — số HS đã đóng/chưa đóng, tổng thu thực tế/tổng dự kiến tháng này
- **Chi tiết lớp**: bảng học sinh + trạng thái đóng phí, lọc theo tháng
- **Giao dịch chưa khớp**: danh sách transaction từ SePay không match invoice nào (sai cú pháp memo, số tiền lệch...) → mỗi dòng có nút **"Gán thủ công vào học sinh..."**: admin chọn lớp → học sinh → hoá đơn unpaid tương ứng, hệ thống tự set `status = paid` cho hoá đơn đó và lưu `transaction_id`, không cần sửa DB tay
- **Quản lý**: CRUD Lớp / Học sinh / Enrollment (bao gồm chuyển trạng thái active ⇄ on_leave cho từng học sinh trong từng lớp)
- **Xuất báo cáo**: Excel theo lớp hoặc theo tháng (danh sách + tổng thu)
- Đăng nhập: 1 tài khoản duy nhất, giáo viên/multi-role để sau

## 6. Việc để sau (đã note, chưa làm ngay)
- Gửi thông báo Zalo/SMS/Email cho phụ huynh sau khi nộp thành công
- Phân quyền nhiều tài khoản (giáo viên xem lớp mình dạy)
- Điểm danh
- Nhắc nhở tự động khi gần hạn/quá hạn

## 7. Cấu trúc Docker Compose (dự kiến)

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on: [db]
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: hoctro
      POSTGRES_USER: hoctro
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes: ["db_data:/var/lib/postgresql/data"]
volumes:
  db_data:
```

## 8. Design System (giao diện hiện đại, rõ ràng)

Hệ thống có **2 giao diện rất khác tính chất**, cần thiết kế riêng chứ không dùng chung 1 theme:

| | Admin Dashboard | Trang nộp học phí (phụ huynh) |
|---|---|---|
| Đối tượng | Chủ trung tâm, dùng máy tính | Phụ huynh, 90% dùng điện thoại |
| Ưu tiên | Nhìn nhanh số liệu, bảng dữ liệu dày | Cực đơn giản, to rõ, 1 việc/màn hình |
| Mật độ thông tin | Cao (bảng, filter, export) | Thấp (tên con → QR → trạng thái) |

### Stack UI
- **Tailwind CSS** + **shadcn/ui** (dựa trên Radix) — component sẵn (table, dialog, badge, toast...), dễ tuỳ biến, agent code AI viết rất quen tay với 2 thư viện này nên tốc độ build nhanh và ít lỗi vặt.
- **lucide-react** cho icon.
- Font: **Inter** cho toàn bộ UI (hỗ trợ tiếng Việt tốt, rõ ở kích thước nhỏ) — không cần font trang trí vì đây là công cụ vận hành, không phải trang marketing.

### Token màu (tránh màu mặc định kiểu AI hay dùng)
| Tên | Hex | Dùng cho |
|---|---|---|
| `primary` (Indigo đậm) | `#3730A3` | Header, nút chính, link |
| `accent` (Amber) | `#F59E0B` | Thành phần CTA cần nhấn mạnh |
| `success` (Emerald) | `#10B981` | Trạng thái "Đã đóng" |
| `warning` (Rose) | `#F43F5E` | "Chưa đóng" / quá hạn |
| `neutral-bg` | `#FAFAF9` | Nền trang |
| `neutral-text` | `#1F2933` | Chữ chính |

Quy tắc: **màu = trạng thái**, dùng nhất quán toàn hệ thống (badge "Đã đóng" luôn xanh emerald, "Chưa đóng" luôn đỏ rose, không đổi màu tuỳ trang).

### Trang nộp học phí — lưu ý riêng
- Chỉ 3 bước trên 1 màn hình di động, không cuộn ngang, chữ tối thiểu 16px.
- Trạng thái rõ bằng cả màu **và** icon (không chỉ dựa vào màu, tránh khó nhìn với người lớn tuổi).
- Mã QR là hành động chính, hiển thị to, rõ và kèm hướng dẫn không sửa nội dung chuyển khoản.
- Có trạng thái loading khi đang chờ webhook xác nhận (spinner + "Đang chờ xác nhận thanh toán...").
- Có trạng thái lỗi rõ ràng nếu link/lớp không tồn tại ("Không tìm thấy lớp học này, vui lòng liên hệ trung tâm").

### Dashboard — lưu ý riêng
- Bảng dữ liệu dùng `shadcn/ui` Table + filter theo tháng/lớp ở đầu bảng.
- Badge trạng thái đóng phí dùng đúng token màu ở trên.
- Empty state có hướng dẫn hành động (VD: chưa có lớp nào → nút "+ Tạo lớp đầu tiên" ngay giữa màn hình, không chỉ để trống).

## 9. Hướng dẫn triển khai theo giai đoạn (cho agent code)

Build tuần tự theo milestone sau, mỗi milestone chạy được và test được trước khi qua bước tiếp — tránh việc agent viết tràn lan rồi khó debug:

1. **Setup**: Next.js + Prisma + Postgres qua Docker Compose chạy được, có seed script tạo sẵn 2-3 lớp mẫu + học sinh mẫu để có dữ liệu test ngay, không phải nhập tay.
2. **CRUD nền tảng**: Lớp học, Học sinh, Enrollment (kèm status active/on_leave) — có admin login đơn giản bảo vệ các trang này.
3. **Tạo hoá đơn**: chức năng "Tạo hoá đơn tháng X" theo lớp, hiển thị + cho sửa tay trước khi chốt.
4. **Trang nộp học phí công khai**: `/pay/[short_code]` chọn học sinh → hiện hoá đơn unpaid + QR (tạm thời có thể chưa cần webhook thật, dùng nút "Đánh dấu đã đóng (test)" để giả lập).
5. **Tích hợp SePay thật**: webhook + matching logic + trang "Giao dịch chưa khớp" với nút gán thủ công.
6. **Dashboard tổng quan + export Excel**.
7. **Polish UI** theo Design System ở mục 8, rà lại responsive, loading/empty/error state.

Mỗi milestone nên có README ngắn ghi lại: đã làm gì, biến môi trường nào mới cần thêm, cách test nhanh — để bạn (hoặc agent sau này) dễ tiếp tục nếu bị gián đoạn giữa chừng.

Biến môi trường cần: `DATABASE_URL`, `SEPAY_API_KEY`, `SEPAY_WEBHOOK_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `BANK_BIN` (mã ngân hàng Techcombank cho VietQR).
