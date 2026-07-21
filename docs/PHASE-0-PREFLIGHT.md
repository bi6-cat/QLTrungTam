# Giai đoạn 0 — kiểm tra an toàn dữ liệu

Giai đoạn này chỉ đọc dữ liệu để phát hiện bất nhất trước khi thay đổi mô hình giao dịch và hóa đơn. Không chạy seed trên production.

## Kiểm tra local/CI

```bash
npm ci
npm run prisma:generate
npm run prisma:validate
npm run typecheck
npm test
npm run build
```

Chạy audit trên database được cấu hình bởi `DATABASE_URL`:

```bash
npm run audit:data
```

Audit không sửa dữ liệu và không in raw payload, mật khẩu hay khóa webhook. Exit code khác `0` nghĩa là có lỗi nghiêm trọng cần xử lý trước migration.

## Preflight trên EC2

Chỉ thực hiện khi chuẩn bị deploy migration. Trước tiên tạo PostgreSQL custom dump:

```bash
mkdir -p backups
docker compose exec -T db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/pre-ledger-migration-$(date +%Y%m%d-%H%M%S).dump"
```

Xác nhận file mới nhất có dữ liệu và đọc được danh mục:

```bash
latest_dump="$(ls -1t backups/pre-ledger-migration-*.dump | head -n 1)"
test -s "$latest_dump"
docker compose exec -T db pg_restore --list < "$latest_dump" >/dev/null
```

Sau đó chạy audit bằng tools container:

```bash
docker compose --profile tools run --rm migrate sh -c \
  'npm ci && npm run prisma:generate && npm run audit:data'
```

Không tiếp tục migration nếu audit báo lỗi nghiêm trọng. Lưu một bản dump ra máy khác hoặc object storage trước khi deploy.

## Điều kiện qua Giai đoạn 0

- Prisma validate, typecheck, unit test và production build đều thành công.
- Audit không phát hiện liên kết transaction–invoice mâu thuẫn.
- Backup production đã được kiểm tra bằng `pg_restore --list` và có một bản off-host.
- Đã ghi lại các ngoại lệ hợp lệ để backfill ở migration kế tiếp.
