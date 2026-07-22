# Deploy lên EC2 bằng Docker Compose

Tài liệu này hướng dẫn đưa app `QLTrungTam` lên EC2 theo mô hình:

```txt
Domain/HTTPS
  -> Nginx/Caddy reverse proxy
    -> Docker Compose app
      -> Postgres container
      -> Docker volume qltrungtam_db_data
```

Nếu bạn muốn database không phụ thuộc EC2, dùng RDS. Nếu muốn tiết kiệm và tự backup volume, dùng đúng hướng dẫn này.

## 1. Chuẩn bị EC2

Khuyến nghị tối thiểu:

- Ubuntu Server 22.04 hoặc 24.04
- EC2 `t3.micro`, `t3.small`, hoặc cao hơn
- Disk tối thiểu 20GB
- Security Group mở:
  - `22` cho SSH
  - `80` cho HTTP
  - `443` cho HTTPS

Không cần mở port Postgres.

SSH vào EC2:

```bash
ssh ubuntu@IP_EC2
```

Cập nhật server:

```bash
sudo apt update && sudo apt upgrade -y
```

## 2. Cài Docker và Docker Compose

```bash
sudo apt install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Cho user hiện tại chạy Docker không cần `sudo`:

```bash
sudo usermod -aG docker $USER
```

Đăng xuất SSH rồi đăng nhập lại, sau đó kiểm tra:

```bash
docker version
docker compose version
```

## 3. Lấy source code

Ví dụ đặt app tại `/opt/QLTrungTam`:

```bash
sudo mkdir -p /opt
sudo chown -R $USER:$USER /opt
cd /opt
git clone <repo-url> QLTrungTam
cd QLTrungTam
```

Nếu bạn copy code thủ công, chỉ cần đảm bảo có đủ:

- `Dockerfile`
- `docker-compose.yml`
- `package.json`
- `prisma/`
- `src/`
- `public/`

## 4. Tạo file `.env`

Tạo `.env` từ mẫu:

```bash
cp .env.example .env
nano .env
```

Ví dụ production:

```env
DATABASE_URL="postgresql://hoctro:MAT_KHAU_DB_MANH@db:5432/hoctro?schema=public"
DB_PASSWORD="MAT_KHAU_DB_MANH"
POSTGRES_DB="hoctro"
POSTGRES_USER="hoctro"

ADMIN_USERNAME="admin"
ADMIN_PASSWORD="MAT_KHAU_ADMIN_MANH"
ADMIN_PASSWORD_HASH=""
SEED_DEMO="false"
SESSION_SECRET="CHUOI_RANDOM_RAT_DAI_TOI_THIEU_32_KY_TU"

SEPAY_API_KEY=""
SEPAY_WEBHOOK_SECRET="SECRET_WEBHOOK_SEPAY"

BANK_ACCOUNT_NUMBER="SO_TAI_KHOAN_THAT"
BANK_ACCOUNT_NAME="TEN_CHU_TAI_KHOAN"
BANK_BIN="MA_BIN_NGAN_HANG"
NEXT_PUBLIC_APP_URL="https://tenmiencuaban.vn"
```

Lưu ý:

- `DB_PASSWORD` phải khớp password trong `DATABASE_URL`.
- `SESSION_SECRET` phải giữ lại khi chuyển EC2 để session/cookie ổn định.
- `NEXT_PUBLIC_APP_URL` phải là domain thật khi chạy production.
- Không commit `.env` lên Git.

## 5. Chạy database và khởi tạo schema

Chạy DB:

```bash
docker compose up -d db
```

Đẩy schema Prisma vào DB:

```bash
docker compose --profile tools run --rm migrate
```

Tạo tài khoản admin ban đầu (chạy MỘT lần). Với `SEED_DEMO="false"` trong `.env`, lệnh này CHỈ tạo/cập nhật admin + cấu hình, **không xoá dữ liệu và không chèn dữ liệu demo**:

```bash
docker compose --profile tools run --rm migrate sh -c "npm install && npm run prisma:seed"
```

Lệnh seed sẽ tạo/cập nhật tài khoản admin theo `ADMIN_USERNAME`, `ADMIN_PASSWORD` hoặc `ADMIN_PASSWORD_HASH` trong `.env`. Vì dùng `upsert` nên chạy lại nhiều lần vẫn an toàn (không mất dữ liệu).

> ⚠️ **Quan trọng:** Tuyệt đối KHÔNG chạy seed khi `SEED_DEMO="true"` trên production — khi đó seed sẽ **xoá sạch** toàn bộ lớp/học sinh/hoá đơn/giao dịch rồi nạp lại dữ liệu demo.

## 6. Build và chạy app

```bash
docker compose up -d --build
```

Kiểm tra:

```bash
docker compose ps
docker compose logs -f app
```

App chạy nội bộ tại:

```txt
http://EC2_IP:3001
```

Nếu chưa cấu hình domain, có thể test tạm:

```bash
curl http://localhost:3001/login
```

## 7. Cấu hình domain và HTTPS

Bạn có thể dùng Nginx hoặc Caddy. Caddy đơn giản hơn vì tự xin SSL.

### Cách A: Caddy

Cài Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Sửa Caddyfile:

```bash
sudo nano /etc/caddy/Caddyfile
```

Nội dung:

```caddy
tenmiencuaban.vn {
  reverse_proxy localhost:3001
}
```

Reload:

```bash
sudo systemctl reload caddy
```

Truy cập:

```txt
https://tenmiencuaban.vn/login
```

### Cách B: Nginx + Certbot

Cài:

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

Tạo config:

```bash
sudo nano /etc/nginx/sites-available/qltrungtam
```

Nội dung:

```nginx
server {
    listen 80;
    server_name tenmiencuaban.vn;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/qltrungtam /etc/nginx/sites-enabled/qltrungtam
sudo nginx -t
sudo systemctl reload nginx
```

Xin SSL:

```bash
sudo certbot --nginx -d tenmiencuaban.vn
```

## 8. Cấu hình SePay webhook

Trong SePay, đặt webhook URL:

```txt
https://tenmiencuaban.vn/api/webhook/sepay
```

Nếu dùng secret, cấu hình header:

```txt
x-sepay-secret: SECRET_WEBHOOK_SEPAY
```

App cũng nhận các header:

```txt
x-api-key
authorization: Bearer <secret>
```

Test webhook:

```bash
curl -X POST https://tenmiencuaban.vn/api/webhook/sepay \
  -H "Content-Type: application/json" \
  -H "x-sepay-secret: SECRET_WEBHOOK_SEPAY" \
  -d '{"id":"test-001","content":"HP L10A 0912345678 T7","amount":1200000}'
```

Nếu đúng, response dạng:

```json
{"ok":true,"matched":true,"reason":"..."}
```

## 9. Backup trước và sau deploy

Trước khi update code:

```bash
docker compose --profile backup run --rm db-dump-backup
docker compose stop app db
docker compose --profile backup run --rm volume-backup
docker compose start db app
```

Upload backup lên S3 nếu có:

```bash
aws s3 sync backups s3://ten-bucket-cua-ban/qltrungtam-backups/
```

Xem thêm file:

```txt
backup-guild.md
```

## 10. Quy trình update phiên bản mới

Không dùng `git pull` rồi khởi động app trước migration. Dùng script deploy có khóa chống chạy song song, backup đã kiểm tra, migration, đối soát dữ liệu và health check DB:

```bash
cd /opt/QLTrungTam
bash scripts/deploy-ec2.sh main
```

Quy trình đầy đủ, cách bootstrap EC2 đang ở bản cũ và smoke test nằm trong `docs/EC2-UPDATE-ROLLBACK.md`.

## 11. Rollback nhanh

Rollback về phiên bản thành công ngay trước:

```bash
cd /opt/QLTrungTam
bash scripts/rollback-ec2.sh
```

Không tự restore DB chỉ vì rollback code. Nếu migration thật sự không tương thích, làm theo phần restore có xác nhận trong `docs/EC2-UPDATE-ROLLBACK.md`.
Sau khi checkout commit cũ, dùng bản script đã được giữ tại `.deploy/restore-db-ec2.sh`, không dùng một bản script cũ trong working tree.

## 12. Checklist sau deploy

Kiểm tra:

- `https://tenmiencuaban.vn/login`
- `http://127.0.0.1:3001/api/health` trả `{"status":"ok","database":"reachable"}`
- Đăng nhập admin được
- Trang Tổng quan hiển thị số liệu
- Trang Lớp học mở được
- Tạo hóa đơn được
- Trang phụ huynh `/pay/<ma-lop>` mở được
- QR hiển thị đúng STK/tên tài khoản
- Webhook SePay test được
- Backup tạo được file trong `backups/`

## 13. Lệnh vận hành thường dùng

Xem container:

```bash
docker compose ps
```

Xem log app:

```bash
docker compose logs -f app
```

Xem log DB:

```bash
docker compose logs -f db
```

Restart app:

```bash
docker compose restart app
```

Restart toàn bộ:

```bash
docker compose restart
```

Tắt:

```bash
docker compose down
```

Tắt nhưng giữ DB volume:

```bash
docker compose down
```

Xóa toàn bộ gồm DB volume, rất nguy hiểm:

```bash
docker compose down -v
```

Không chạy lệnh `down -v` trên production trừ khi đã backup và thật sự muốn xóa dữ liệu.

## 14. Lưu ý bảo mật

- Không mở port `5432` hoặc `5433` ra internet.
- Chỉ mở `80`, `443`, và `22`.
- Đổi SSH sang key, không dùng password SSH.
- Đổi `ADMIN_PASSWORD`.
- Đặt `SESSION_SECRET` dài và ngẫu nhiên.
- Đặt `SEPAY_WEBHOOK_SECRET`.
- Backup định kỳ lên S3 hoặc nơi khác ngoài EC2.
- Không commit `.env` và thư mục `backups`.
