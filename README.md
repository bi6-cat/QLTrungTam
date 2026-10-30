# QLTrungTam

Ứng dụng quản lý trung tâm dạy thêm APLUS ACADEMY: lớp, học sinh, điểm danh, học phí thu qua
VietQR/SePay, lương giáo viên, khảo sát, kèm cổng học tập cho giáo viên và học sinh.

Một ứng dụng Next.js (App Router), một database PostgreSQL qua Prisma, chạy bằng Docker Compose.

## Chức năng

| Khu | Đường dẫn | Ai dùng | Làm được gì |
|---|---|---|---|
| Quản trị | `/admin` (đăng nhập `/login`, chung với giáo viên) | Chủ trung tâm, quản lý phụ | Tổng quan, lớp học, học sinh (nhập từ Excel), thời khóa biểu, công nợ, giao dịch, thu chi, lương GV, báo cáo Excel, khảo sát, tài khoản học tập, cài đặt (VietQR, mẫu nhắc nợ, đồng bộ Google Sheets) |
| Cổng giáo viên | `/teacher` (đăng nhập `/login`, chung với quản lý) | Giáo viên có tài khoản | Xem lớp được gán, giao bài và xem kết quả (tab Bài tập), đăng tài liệu cho lớp |
| Cổng học sinh | `/learn` (đăng nhập `/login?as=student`, mã dạng `HuongNV02` + PIN) | Học sinh | Làm bài được giao, xem điểm và đáp án, xem tài liệu của lớp |
| Trang công khai | `/pay/<mã lớp>`, `/survey/<slug>`, `/teacher/classes/<mã lớp>-<mã>` | Phụ huynh, giáo viên chưa có tài khoản | Quét QR đóng học phí, làm khảo sát, mở trang điểm danh của lớp bằng link riêng |

Quản lý phụ chỉ vào được một phần trang admin, danh sách trang nằm trong
[src/lib/roles.ts](src/lib/roles.ts). Tài khoản giáo viên và học sinh do chủ trung tâm tạo ở
**Tài khoản học tập**. Quản lý và giáo viên đăng nhập chung một form: hệ thống thử tài khoản quản
trị trước rồi tới giáo viên, nên tên đăng nhập không được trùng giữa hai loại (chặn lúc tạo). Mỗi khu
vẫn dùng cookie phiên riêng.

### Học phí qua SePay

Mỗi hóa đơn tháng có một nội dung chuyển khoản riêng. SePay gọi webhook
`/api/webhook/sepay` khi có tiền vào, app tự khớp giao dịch với hóa đơn theo nội dung và số
tiền. Giao dịch không khớp được thì nằm ở trang **Giao dịch** để gán tay. Mọi thay đổi tiền
đều ghi audit log. Quy tắc nội dung chuyển khoản và mô hình dữ liệu gốc có trong
[DacTaDuAn.md](DacTaDuAn.md).

### Cổng học tập

- **Bài tập:** tab chung cho mọi loại bài. Hiện có kiểm tra từ vựng; trắc nghiệm và nộp bài bằng
  ảnh sẽ thêm vào cùng tab.
- **Từ vựng:** chỉ hiện với giáo viên được bật ở Tài khoản học tập (giáo viên ngoại ngữ). Giáo viên
  dán danh sách từ hoặc tải file Excel/CSV/Quizlet để tạo bộ từ, rồi giao bài cho
  lớp với số câu, dạng câu, giới hạn thời gian, số lượt làm và hạn nộp. Mỗi lượt làm sinh một
  đề trộn khác nhau. Đáp án chỉ nằm ở server cho đến khi nộp. Giáo viên thấy điểm từng học
  sinh và những từ hay sai.
- **Tài liệu:** giáo viên đăng đường dẫn (Google Drive, YouTube…) và/hoặc ghi chú cho lớp.
  App không lưu file, chỉ nhận đường dẫn `http`/`https`.
- **Tài khoản học sinh:** mã là tên không dấu + chữ cái đầu của họ và đệm + số thứ tự
  (Nguyễn Văn Hương → `HuongNV01`), gõ hoa thường đều được. Mã đoán được nên chặn dò PIN theo cặp
  (mã, IP): một máy gõ sai 5 lần bị chặn 15 phút; cả tài khoản chỉ khoá sau 30 lần sai.
- Học sinh thấy bài và tài liệu của các lớp đang học, kể cả khi đang bảo lưu. Lớp đổi giáo
  viên thì giáo viên mới quản lý tiếp bài và tài liệu cũ.

## Cấu trúc thư mục

```text
src/app/           Trang và API route (admin, teacher, learn, pay, survey, webhook)
src/components/    Component giao diện dùng chung
src/lib/           Nghiệp vụ cũ: lớp, hóa đơn, sổ giao dịch, lương, khảo sát, Sheets…
src/modules/       Nghiệp vụ mới chia theo module: core, identity, center, learning
prisma/            schema.prisma, migrations, seed
tests/             Unit test và integration test (node:test)
deploy/            Compose production: app, monitoring, GCP (Terraform, script chuyển nhà)
monitoring/        Cấu hình Prometheus, Grafana, Alertmanager, exporter
docs/              Tài liệu vận hành và runbook
infra/lab/         Bài lab hạ tầng cá nhân, không dùng cho production
```

Code mới đặt trong `src/modules`. Mỗi module chỉ được import những module nó khai báo phụ thuộc,
và `npm test` có test kiểm tra quy tắc này. Quy tắc chi tiết và cách thêm module xem
[src/modules/README.md](src/modules/README.md). Code trong `src/lib` sẽ chuyển dần sang module khi có
dịp sửa tới.

## Chạy local bằng Docker

Cần Docker Engine/Desktop có Compose plugin. Host không cần cài Node.js.

```bash
cp .env.example .env
mkdir -p secrets
openssl rand -hex 16 | tr -d '\n' > secrets/postgres_exporter_password.txt
openssl rand -hex 16 | tr -d '\n' > secrets/grafana_admin_password.txt
docker network create qltrungtam-observability   # đã có thì báo lỗi, bỏ qua được
docker compose -f docker-compose.app.dev.yml up -d
docker compose -f docker-compose.monitoring.dev.yml up -d   # không bắt buộc
```

Container `app` tự cài package, chạy migration, seed rồi `next dev`. Lần đầu mất vài phút.
Kiểm tra bằng `docker compose -f docker-compose.app.dev.yml ps`.

| Dịch vụ | Địa chỉ |
|---|---|
| App | <http://127.0.0.1:3001>, đăng nhập admin bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env` |
| PostgreSQL | `127.0.0.1:5433` |
| Grafana | <http://127.0.0.1:3002> |
| Prometheus | <http://127.0.0.1:9090> |

Về seed:

- `SEED_DEMO=true` tạo dữ liệu demo và **xóa sạch dữ liệu cũ**. Seed demo bị từ chối khi
  `NODE_ENV=production`. Giá trị khác `true` chỉ tạo admin và cấu hình.
- Seed không ghi đè mật khẩu admin đã đổi. Muốn đặt lại theo `.env` thì chạy với
  `SEED_RESET_ADMIN_PASSWORD=true`.

Không chạy `docker compose down -v` nếu muốn giữ dữ liệu, vì lệnh này xóa cả named volume.

Đổi `prisma/schema.prisma` thì tạo migration mới trong container:
`docker compose -f docker-compose.app.dev.yml exec app npx prisma migrate dev --name <tên>`.

## Cấu hình

Biến môi trường đọc từ `.env`. Mẫu cho local nằm trong [.env.example](.env.example).

| Biến | Dùng cho |
|---|---|
| `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `DB_PASSWORD` | Kết nối và khởi tạo PostgreSQL |
| `SESSION_SECRET` | Ký cookie phiên của cả ba khu. Production bắt buộc đặt một chuỗi ngẫu nhiên dài |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` hoặc `ADMIN_PASSWORD_HASH` | Tài khoản chủ trung tâm khi seed |
| `SEED_DEMO`, `SEED_RESET_ADMIN_PASSWORD` | Hành vi seed (xem trên) |
| `SEPAY_API_KEY`, `SEPAY_WEBHOOK_SECRET` | Gọi API SePay và xác thực webhook |
| `BANK_ACCOUNT_NUMBER`, `BANK_ACCOUNT_NAME`, `BANK_BIN` | Tài khoản nhận tiền in trên mã VietQR |
| `NEXT_PUBLIC_APP_URL` | Địa chỉ gốc của app, dùng khi tạo link thanh toán, link lớp, link khảo sát |

Nhóm SePay, tài khoản ngân hàng và `NEXT_PUBLIC_APP_URL` chỉ là giá trị mặc định: khi đã lưu trong
**Cài đặt** của admin thì giá trị trong database được dùng. Mẫu tin nhắn nhắc nợ, mốc chốt lương
và đồng bộ Google Sheets cũng cấu hình ở **Cài đặt**.

## Kiểm thử

| Lệnh | Kiểm tra |
|---|---|
| `npm run prisma:validate` | Schema Prisma hợp lệ |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit test, không cần database (gồm cả test ranh giới module) |
| `npm run test:integration` | Sổ giao dịch, hóa đơn, lương, tài khoản cổng, bài giao và tài liệu trên PostgreSQL thật. Tên database phải chứa `_test` |
| `npm run build` | Build production |

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) chạy đủ các lệnh trên cho mỗi push vào
`main`, `dev` và mỗi pull request.

Host không có Node.js thì chạy tất cả trong container, dùng một database test riêng:

```bash
docker network create qltt-it
docker run -d --name qltt-it-db --network qltt-it \
  -e POSTGRES_USER=qltt -e POSTGRES_PASSWORD=qltt -e POSTGRES_DB=qltrungtam_test postgres:16-alpine

docker run --rm --network qltt-it -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e DATABASE_URL="postgresql://qltt:qltt@qltt-it-db:5432/qltrungtam_test?schema=public" \
  -e SESSION_SECRET=local-test-secret-at-least-16 \
  -v "$PWD":/app -w /app node:22-bookworm \
  sh -c "npm ci && npx prisma generate && npx prisma migrate deploy && npm run typecheck && npm test && npm run test:integration"
```

Cách integration test tạo và dọn dữ liệu xem [tests/README.md](tests/README.md).

## Deploy và vận hành

Branch deploy là `dev`. Production chạy Compose trong `/opt/QLTrungTam` và luôn gọi đủ env file
và compose file:

```bash
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  <command>
```

Script deploy chạy `prisma migrate deploy` và kiểm tra dữ liệu tài chính (`npm run audit:data`)
qua service `migrate` trước khi khởi động lại app. Các bước cụ thể, cách rollback và backup xem
tài liệu dưới đây:

- [Tổng quan vận hành: kiến trúc, secret, security, checklist](docs/OPERATIONS.md)
- [Deploy và rollback app](docs/runbooks/APP-DEPLOY-ROLLBACK.md)
- [Backup và restore PostgreSQL (pgBackRest)](docs/runbooks/POSTGRES-BACKUP-RESTORE.md)
- [Monitoring](docs/runbooks/MONITORING.md)
- [Chuyển production từ EC2 sang GCP](docs/runbooks/MIGRATE-AWS-TO-GCP.md)

## Quy ước

- Commit message tiếng Anh dạng `type: summary` (`feat`, `fix`, `build`, `docs`…).
- Không commit `.env`, `secrets/`, `backups/`, `.deploy/`.
- Không dán secret vào issue, pull request, chat hay log vận hành.
