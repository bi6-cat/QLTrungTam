#!/usr/bin/env bash
# In số dòng từng bảng trong schema public + migration Prisma mới nhất, dạng "bảng<TAB>số".
# Chỉ đọc. Chạy trên host cũ và host mới rồi diff để xác nhận restore đủ dữ liệu.
#   APP_DIR=/opt/QLTrungTam bash scripts/db-row-counts.sh > counts.tsv

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

docker compose \
  --env-file "$APP_DIR/.env" \
  -f "$APP_DIR/deploy/app/docker-compose.yml" \
  exec -T db sh -ceu 'psql -X -q -A -t -F "	" -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT table_name,
       (xpath('/row/c/text()',
              query_to_xml(format('SELECT count(*) AS c FROM public.%I', table_name), false, true, '')))[1]::text
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;
SELECT '#latest_migration', max(migration_name) FROM public._prisma_migrations WHERE finished_at IS NOT NULL;
SQL
