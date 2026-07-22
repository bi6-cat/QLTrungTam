# Backup và chuyển EC2 khi dùng Docker Compose

Tài liệu này dành cho mô hình chạy thật tiết kiệm:

```txt
EC2
  - Docker Compose
  - App Next.js
  - Postgres container
  - DB nằm trong Docker volume: qltrungtam_db_data
```

Mục tiêu: có thể thay EC2 khác mà vẫn giữ dữ liệu bằng cách backup/restore database volume hoặc file dump.

## 1. Cấu hình production trên EC2

File `docker-compose.yml` đã được tối ưu cho EC2:

- App tự restart với `restart: unless-stopped`.
- Postgres tự restart với `restart: unless-stopped`.
- DB không mở port ra ngoài internet.
- DB có healthcheck trước khi app chạy.
- Log Docker giới hạn dung lượng.
- Volume DB có tên cố định: `qltrungtam_db_data`.
- Có service backup/restore bằng Docker Compose profile.

Tạo `.env` trên EC2:

```env
DATABASE_URL="postgresql://hoctro:MAT_KHAU_MANH@db:5432/hoctro?schema=public"
DB_PASSWORD="MAT_KHAU_MANH"
POSTGRES_DB="hoctro"
POSTGRES_USER="hoctro"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="mat-khau-admin-manh"
ADMIN_PASSWORD_HASH=""
SESSION_SECRET="chuoi-random-rat-dai-it-nhat-32-ky-tu"

SEPAY_API_KEY=""
SEPAY_WEBHOOK_SECRET="secret-webhook-neu-dung"

BANK_ACCOUNT_NUMBER="so-tai-khoan-that"
BANK_ACCOUNT_NAME="TEN CHU TAI KHOAN"
BANK_BIN="ma-bin-ngan-hang"
NEXT_PUBLIC_APP_URL="https://tenmiencuaban.vn"
```

Chạy lần đầu:

```bash
docker compose up -d db
docker compose --profile tools run --rm migrate
docker compose up -d --build app
```

Các lần sau:

```bash
docker compose up -d --build
```

## 2. Hai kiểu backup

Có 2 cách backup:

```txt
pg_dump backup
  - Chạy được khi app vẫn online
  - File nhỏ hơn, sạch hơn
  - Khuyến nghị chạy hằng ngày

raw volume backup
  - Copy nguyên Docker volume
  - Nên dừng app/db trước khi backup
  - Hữu ích khi chuyển nguyên trạng sang EC2 khác
```

Khuyến nghị thực tế:

- Hằng ngày: dùng `pg_dump`.
- Trước khi chuyển EC2 hoặc nâng cấp lớn: dùng cả `pg_dump` và raw volume backup.
- Sau backup: upload lên S3 hoặc tải về máy cá nhân.

## 3. Backup bằng pg_dump

Tạo thư mục backup:

```bash
mkdir -p backups
```

Chạy backup:

```bash
docker compose --profile backup run --rm db-dump-backup
```

File sẽ nằm trong thư mục:

```txt
./backups/
```

Dạng file:

```txt
hoctro-20260704-120000.dump
```

Kiểm tra:

```bash
ls -lh backups
```

## 4. Backup raw Docker volume

Quan trọng: nên dừng app và db trước khi backup raw volume để dữ liệu nhất quán.

```bash
docker compose stop app db
docker compose --profile backup run --rm volume-backup
docker compose start db app
```

File tạo ra:

```txt
backups/db_data-20260704-120000.tar.gz
```

Kiểm tra volume:

```bash
docker volume ls | grep qltrungtam_db_data
```

## 5. Upload backup lên S3

Cài AWS CLI và cấu hình credential trước.

Ví dụ upload toàn bộ thư mục `backups`:

```bash
aws s3 sync backups s3://ten-bucket-cua-ban/qltrungtam-backups/
```

Nên dùng bucket riêng, bật versioning nếu có thể.

Ví dụ cron hằng ngày lúc 2h sáng:

```bash
crontab -e
```

Thêm dòng:

```cron
0 2 * * * cd /opt/QLTrungTam && docker compose --profile backup run --rm db-dump-backup && aws s3 sync backups s3://ten-bucket-cua-ban/qltrungtam-backups/
```

## 6. Restore bằng pg_dump sang EC2 mới

Trên EC2 mới:

```bash
git clone <repo-url> /opt/QLTrungTam
cd /opt/QLTrungTam
```

Tạo `.env` giống EC2 cũ. Quan trọng:

- `DB_PASSWORD` phải đúng với DB mới.
- `SESSION_SECRET` nên giữ giống cũ nếu muốn session không bị đổi ngay.
- `NEXT_PUBLIC_APP_URL` giữ theo domain thật.

Khởi động DB rỗng:

```bash
docker compose up -d db
docker compose --profile tools run --rm migrate
```

Copy file dump vào thư mục `backups`, ví dụ:

```bash
mkdir -p backups
aws s3 cp s3://ten-bucket-cua-ban/qltrungtam-backups/hoctro-20260704-120000.dump backups/
```

Restore:

```bash
docker compose exec -T db pg_restore -U hoctro -d hoctro --clean --if-exists < backups/hoctro-20260704-120000.dump
```

Chạy app:

```bash
docker compose up -d --build app
```

## 7. Restore raw volume sang EC2 mới

Khi dùng raw volume backup, nên restore trước khi chạy DB.

Trên EC2 mới:

```bash
git clone <repo-url> /opt/QLTrungTam
cd /opt/QLTrungTam
mkdir -p backups
```

Tải file volume backup:

```bash
aws s3 cp s3://ten-bucket-cua-ban/qltrungtam-backups/db_data-20260704-120000.tar.gz backups/
```

Đảm bảo app/db đang dừng:

```bash
docker compose down
docker compose create db
```

Restore volume:

```bash
CONFIRM_VOLUME_RESTORE=YES \
  bash scripts/restore-volume-ec2.sh db_data-20260704-120000.tar.gz
```

Chạy lại:

```bash
docker compose up -d --build
curl -f http://127.0.0.1:3001/api/health
```

## 8. Chuyển EC2 nhưng giữ domain

Quy trình gọn:

1. Trên EC2 cũ, chạy backup:

```bash
docker compose --profile backup run --rm db-dump-backup
docker compose stop app db
docker compose --profile backup run --rm volume-backup
docker compose start db app
aws s3 sync backups s3://ten-bucket-cua-ban/qltrungtam-backups/
```

2. Trên EC2 mới, restore bằng `pg_dump` hoặc raw volume.
3. Chạy app trên EC2 mới.
4. Đổi DNS/domain sang IP EC2 mới.
5. Vào admin kiểm tra:

```txt
/login
/admin
/admin/classes
/pay/<ma-lop>
```

6. Cập nhật webhook SePay nếu domain thay đổi. Nếu vẫn giữ domain cũ thì không cần đổi webhook.

## 9. Kiểm tra backup có dùng được không

Ít nhất mỗi tháng nên thử restore sang một máy test hoặc EC2 test.

Checklist:

- Đăng nhập admin được.
- Danh sách lớp còn đủ.
- Hóa đơn tháng hiện tại còn đủ.
- Lịch sử giao dịch còn đủ.
- Trang phụ huynh mở được.
- Webhook SePay test trả `ok: true`.

## 10. Lưu ý quan trọng

- Không commit thư mục `backups` lên Git.
- Không để `.env` lên Git.
- Không mở port Postgres ra internet.
- Đổi `ADMIN_PASSWORD` và `SESSION_SECRET` trước khi chạy thật.
- Backup nằm cùng EC2 thì vẫn có rủi ro mất máy là mất backup. Nên upload lên S3.
- Raw volume backup cần dừng DB để tránh file backup bị lỗi ngầm.
- `pg_dump` an toàn hơn để backup định kỳ khi hệ thống đang chạy.

