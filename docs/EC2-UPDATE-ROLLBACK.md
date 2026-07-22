# Update và rollback trên EC2

Các script này dành cho bản production chạy bằng `docker-compose.yml` trong repo.

## Deploy phiên bản mới

Khuyến nghị luôn bootstrap riêng script mới nhất từ đúng branch sắp phát hành. Cách này giữ nguyên commit cũ làm mốc rollback và không phụ thuộc script đang có trên EC2:

```bash
cd /opt/QLTrungTam
git fetch origin main
git show origin/main:scripts/deploy-ec2.sh > /tmp/qltrungtam-deploy.sh
APP_DIR="$PWD" bash /tmp/qltrungtam-deploy.sh main
```

Không chạy `git pull` trước bước bootstrap này, vì như vậy script không còn xác định được commit đang chạy trước khi update.

Nếu production chạy branch `dev`, thay toàn bộ `main` trong lệnh bootstrap bằng `dev`:

```bash
cd /opt/QLTrungTam
git fetch origin dev
git show origin/dev:scripts/deploy-ec2.sh > /tmp/qltrungtam-deploy.sh
APP_DIR="$PWD" bash /tmp/qltrungtam-deploy.sh dev
```

Luôn gọi script qua `bash`. Không chạy `chmod +x scripts/*-ec2.sh` trên một checkout production cũ: thay đổi mode của file Git có thể làm working tree bị đánh dấu dirty và chốt an toàn sẽ từ chối deploy.

Nếu EC2 đã checkout đúng target commit nhưng container chưa được dựng lại, sau khi xác minh commit có thể chạy lại bootstrap với `FORCE_DEPLOY=1`.

Script sẽ thực hiện theo thứ tự:

1. Từ chối chạy nếu source trên EC2 có file đang sửa/chưa commit.
2. `git fetch` và lấy chính xác commit mới nhất của branch chỉ định.
3. Tạo PostgreSQL custom dump trong `backups/` và xác minh dump đọc được bằng `pg_restore --list`.
4. Checkout commit mới, build image, chạy migration rồi tự động đối soát dữ liệu tài chính trước khi thay app.
5. Thay container app và kiểm tra ứng dụng, kết nối DB cùng các bảng/cột bắt buộc qua `http://127.0.0.1:3001/api/health`.
6. Nếu build, migration, khởi động hoặc health check lỗi, tự build lại commit cũ.

Có thể đổi URL kiểm tra nếu cần:

```bash
HEALTH_URL=http://127.0.0.1:3001/api/health bash scripts/deploy-ec2.sh main
```

EC2 được checkout ở trạng thái detached HEAD có chủ đích. Không sửa code trực tiếp trên EC2; mọi thay đổi nên được commit và push từ máy phát triển.

Thư mục `backups/` vẫn nằm trên máy EC2. Nên đồng bộ các file dump đã xác minh sang S3 hoặc nơi lưu ngoài máy trước các đợt nâng cấp lớn.
`DATABASE_URL` và `DB_PASSWORD` là biến bắt buộc trong `.env`; không dùng giá trị mẫu trên production.

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

Nếu auto-rollback đã checkout commit cũ nhưng build/start thất bại, buộc dựng lại đúng commit đang đứng bằng bộ script ổn định:

```bash
FORCE_RECREATE=YES bash .deploy/rollback-ec2.sh <commit-cu>
```

Script vẫn backup database hiện tại trước khi rollback. Mặc định nó chỉ rollback code/container, không tự restore DB để tránh làm mất giao dịch hoặc dữ liệu mới. Trước khi checkout commit cũ, bộ script vận hành mới được giữ trong `.deploy/` để không mất các chốt an toàn.

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
CONFIRM_DB_RESTORE=YES bash .deploy/restore-db-ec2.sh backups/pre-deploy-YYYYMMDD-HHMMSS-COMMIT.dump
```

Lệnh này dừng app, tạo thêm một bản cứu hộ, xóa/tạo lại database và restore toàn bộ dump. Mọi dữ liệu phát sinh sau thời điểm của dump sẽ mất. Nếu restore lỗi, script thử phục hồi tự động từ bản cứu hộ vừa tạo và giữ app dừng nếu cả hai lần đều lỗi.

Ưu tiên restore custom dump ở trên. Chỉ restore thẳng Docker volume trong tình huống cứu hộ đặc biệt, khi đã dừng hẳn PostgreSQL và có đúng file `db_data-*.tar.gz`:

```bash
docker compose stop app db
CONFIRM_VOLUME_RESTORE=YES \
  bash .deploy/restore-volume-ec2.sh db_data-YYYYMMDD-HHMMSS.tar.gz
docker compose start db app
curl -f http://127.0.0.1:3001/api/health
```

Script ổn định trong `.deploy/` không phụ thuộc `docker-compose.yml` của commit đã rollback. Nó từ chối khi volume còn container sử dụng hoặc còn `postmaster.pid`, xác minh archive có cấu trúc PGDATA của PostgreSQL 16 trước khi xóa, tạo và kiểm tra một bản cứu hộ mới, đồng thời tự phục hồi bản cứu hộ nếu giải nén đích thất bại hay bị gián đoạn.

Sau rollback/restore, kiểm tra:

```bash
curl -f http://127.0.0.1:3001/api/health
docker compose ps
docker compose logs --tail=100 app
```

Sau đó kiểm tra đăng nhập, danh sách lớp/học sinh, hóa đơn và webhook SePay trên domain thật.

Với release có migration tài chính/lưu trữ, smoke test thêm:

1. Mở một hồ sơ học sinh 360° và kiểm tra nợ cũ vẫn hiện khi hồ sơ/lớp đã lưu trữ.
2. Tải file mẫu import Excel, preview một file nhỏ nhưng không commit dữ liệu thử nếu đang production.
3. Mở một giao dịch chưa khớp, tìm hóa đơn theo tên/SĐT/memo và kiểm tra gợi ý đúng tiền đứng đầu.
4. Gửi một giao dịch bằng SePay Test Mode, kiểm tra webhook chỉ ghi nhận một lần.
5. Chạy lại `docker compose --profile tools run --rm migrate sh -c 'npm ci && npm run audit:data'`; yêu cầu 0 lỗi nghiêm trọng trước khi kết thúc maintenance.
