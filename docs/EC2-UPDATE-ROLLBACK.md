# Update và rollback trên EC2

Các script này dành cho bản production chạy bằng `docker-compose.yml` trong repo.

## Deploy phiên bản mới

Sau khi commit và push các script lên remote, nếu EC2 đã có thư mục `scripts/` thì lần đầu cấp quyền chạy (hoặc luôn gọi bằng `bash`):

```bash
cd /opt/QLTrungTam
chmod +x scripts/*-ec2.sh
```

Nếu EC2 đang ở phiên bản cũ chưa có script, bootstrap riêng script từ remote để vẫn giữ được commit cũ làm mốc rollback:

```bash
cd /opt/QLTrungTam
git fetch origin main
git show origin/main:scripts/deploy-ec2.sh > /tmp/qltrungtam-deploy.sh
APP_DIR="$PWD" bash /tmp/qltrungtam-deploy.sh main
```

Không chạy `git pull` trước bước bootstrap này, vì như vậy script không còn xác định được commit đang chạy trước khi update.

Deploy branch `main`:

```bash
cd /opt/QLTrungTam
bash scripts/deploy-ec2.sh main
```

Nếu production chạy branch `dev`:

```bash
bash scripts/deploy-ec2.sh dev
```

Script sẽ thực hiện theo thứ tự:

1. Từ chối chạy nếu source trên EC2 có file đang sửa/chưa commit.
2. `git fetch` và lấy chính xác commit mới nhất của branch chỉ định.
3. Tạo PostgreSQL custom dump trong `backups/`.
4. Checkout commit mới, build image, chạy `prisma migrate deploy`.
5. Thay container app và kiểm tra `http://127.0.0.1:3001/login`.
6. Nếu build, migration, khởi động hoặc health check lỗi, tự build lại commit cũ.

Có thể đổi URL kiểm tra nếu cần:

```bash
HEALTH_URL=http://127.0.0.1:3001/login bash scripts/deploy-ec2.sh main
```

EC2 được checkout ở trạng thái detached HEAD có chủ đích. Không sửa code trực tiếp trên EC2; mọi thay đổi nên được commit và push từ máy phát triển.

## Rollback ứng dụng

Rollback về phiên bản thành công ngay trước đó:

```bash
cd /opt/QLTrungTam
bash scripts/rollback-ec2.sh
```

Hoặc chỉ định commit/tag cụ thể:

```bash
bash scripts/rollback-ec2.sh <commit-hoac-tag>
```

Script vẫn backup database hiện tại trước khi rollback. Mặc định nó chỉ rollback code/container, không tự restore DB để tránh làm mất giao dịch hoặc dữ liệu mới.

Xem log nếu health check không qua:

```bash
docker compose ps
docker compose logs --tail=200 app
docker compose logs --tail=200 db
```

## Chỉ restore DB khi migration không tương thích

Phần lớn migration production nên tương thích ngược để chỉ cần rollback ứng dụng. Nếu phiên bản mới đã thay đổi dữ liệu/schema khiến code cũ không chạy được, chọn file `pre-deploy-...dump` được in ra lúc deploy rồi chạy:

```bash
cd /opt/QLTrungTam
ls -lh backups/pre-deploy-*.dump
CONFIRM_DB_RESTORE=YES bash scripts/restore-db-ec2.sh backups/pre-deploy-YYYYMMDD-HHMMSS-COMMIT.dump
```

Lệnh này dừng app, tạo thêm một bản cứu hộ, xóa/tạo lại database và restore toàn bộ dump. Mọi dữ liệu phát sinh sau thời điểm của dump sẽ mất. Nếu restore lỗi, script thử phục hồi tự động từ bản cứu hộ vừa tạo và giữ app dừng nếu cả hai lần đều lỗi.

Sau rollback/restore, kiểm tra:

```bash
curl -f http://127.0.0.1:3001/login
docker compose ps
docker compose logs --tail=100 app
```

Sau đó kiểm tra đăng nhập, danh sách lớp/học sinh, hóa đơn và webhook SePay trên domain thật.
