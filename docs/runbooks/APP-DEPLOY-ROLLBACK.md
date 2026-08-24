# Runbook deploy và rollback ứng dụng

## Phạm vi

- Repo production: `/opt/QLTrungTam`.
- Branch deploy hiện tại: `dev`.
- App Compose: `/opt/QLTrungTam/deploy/app/docker-compose.yml`.
- Public health: `https://aplus.zett.io.vn/api/health`.
- Local health: `http://127.0.0.1:3001/api/health`.

Các script trong `scripts/` đã đóng gói đầy đủ `--env-file` và `-f` production.
Không gọi Compose mặc định ở repo root.

## Preflight

```bash
cd /opt/QLTrungTam
git status --short
git rev-parse --short HEAD
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  config --quiet
curl --fail --silent --show-error \
  http://127.0.0.1:3001/api/health
```

Điều kiện tiếp tục:

- Working tree sạch.
- Compose parse thành công.
- Production DB healthy và health endpoint hiện tại hoạt động.
- Có backup pgBackRest gần nhất thành công; xem runbook backup.
- Commit mục tiêu đã qua review/test.

## Deploy

Bootstrap script từ đúng branch mà chưa pull working tree trước:

```bash
cd /opt/QLTrungTam
git fetch origin dev
git show origin/dev:scripts/deploy-ec2.sh \
  > /tmp/qltrungtam-deploy.sh
APP_DIR=/opt/QLTrungTam \
  bash /tmp/qltrungtam-deploy.sh dev
```

Script dùng `flock`, tạo logical dump trước deploy, build App, chạy Prisma migration
và audit dữ liệu, thay riêng App container, health check và tự thử rollback App khi
deploy lỗi. Logical dump này là safety point cho release, không thay thế pgBackRest.

## Xác minh sau deploy

```bash
cd /opt/QLTrungTam
git rev-parse --short HEAD
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  ps
curl --fail --silent --show-error \
  http://127.0.0.1:3001/api/health
curl --fail --silent --show-error \
  https://aplus.zett.io.vn/api/health
```

Smoke test đăng nhập, dashboard, lớp/học sinh, invoice và SePay Test Mode nếu release
chạm luồng thanh toán. Không tạo giao dịch production giả ngoài quy trình được duyệt.

## Rollback App

Rollback version gần nhất được script ghi trong `.deploy/state.env`:

```bash
cd /opt/QLTrungTam
bash .deploy/rollback-ec2.sh
```

Hoặc chỉ định commit đã biết:

```bash
bash .deploy/rollback-ec2.sh <commit>
```

Rollback App không tự restore DB. Đây là mặc định an toàn vì restore DB có thể làm
mất dữ liệu phát sinh sau backup.

## Khi nào mới restore DB

Chỉ restore khi có bằng chứng migration/schema làm version được chọn không thể chạy,
đã đánh giá mất dữ liệu và có phê duyệt maintenance. Theo
[runbook backup/restore](POSTGRES-BACKUP-RESTORE.md).

## Điều tra deploy lỗi

```bash
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  logs --tail=200 app

docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  logs --tail=200 db
```

Ghi timeline, commit cũ/mới, migration đã chạy, health response và hành động rollback.
Không paste environment hoặc connection string vào incident log.
