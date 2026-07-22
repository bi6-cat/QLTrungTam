#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
LEGACY_HEALTH_URL="${LEGACY_HEALTH_URL:-http://127.0.0.1:3001/login}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
STATE_DIR="$APP_DIR/.deploy"
BACKUP_DIR="$APP_DIR/backups"

log() {
  printf '[restore-db] %s\n' "$*"
}

die() {
  printf '[restore-db] ERROR: %s\n' "$*" >&2
  exit 1
}

restore_dump() {
  local dump_file="$1"

  docker compose exec -T db sh -ceu '
    export PGPASSWORD="$POSTGRES_PASSWORD"
    dropdb --if-exists --force -h 127.0.0.1 -U "$POSTGRES_USER" "$POSTGRES_DB"
    createdb -h 127.0.0.1 -U "$POSTGRES_USER" -O "$POSTGRES_USER" "$POSTGRES_DB"
  '
  docker compose exec -T db sh -ceu \
    'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    <"$dump_file"
}

wait_for_db() {
  local attempt
  for ((attempt = 1; attempt <= 30; attempt++)); do
    if docker compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

wait_for_app() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    if [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 "$HEALTH_URL" || true)" == "404" ]] \
      && curl --fail --silent --show-error --max-time 5 "$LEGACY_HEALTH_URL" >/dev/null 2>&1; then
      log "Commit cũ chưa có API health; dùng endpoint đăng nhập rồi kiểm tra Prisma riêng."
      return 0
    fi
    sleep 3
  done

  docker compose logs --tail=100 app >&2 || true
  return 1
}

check_app_database() {
  docker compose exec -T app node -e '
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    (async () => {
      try {
        await Promise.all([
          prisma.classRoom.findFirst({ select: { id: true } }),
          prisma.monthlyInvoice.findFirst({ select: { id: true } })
        ]);
      } finally {
        await prisma.$disconnect();
      }
    })().catch(() => process.exit(1));
  ' >/dev/null 2>&1
}

cd "$APP_DIR"

[[ -n "${1:-}" ]] || die "Cách dùng: CONFIRM_DB_RESTORE=YES bash scripts/restore-db-ec2.sh backups/<file>.dump"
[[ "${CONFIRM_DB_RESTORE:-}" == "YES" ]] || die "Restore sẽ thay toàn bộ DB. Chạy lại với CONFIRM_DB_RESTORE=YES"

for command_name in docker curl flock; do
  command -v "$command_name" >/dev/null 2>&1 || die "Thiếu lệnh: $command_name"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin chưa được cài"
[[ -f .env ]] || die "Không tìm thấy $APP_DIR/.env"
[[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "HEALTH_RETRIES phải là số nguyên dương"

case "$1" in
  /*) DUMP_FILE="$1" ;;
  *) DUMP_FILE="$APP_DIR/$1" ;;
esac
[[ -f "$DUMP_FILE" && -s "$DUMP_FILE" ]] || die "Không tìm thấy file dump hoặc file rỗng: $DUMP_FILE"

mkdir -p "$STATE_DIR" "$BACKUP_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "Một tiến trình deploy/rollback khác đang chạy"

docker compose up -d db
wait_for_db || die "PostgreSQL chưa sẵn sàng"
docker compose exec -T db pg_restore --list <"$DUMP_FILE" >/dev/null \
  || die "File không phải PostgreSQL custom dump hợp lệ"

RESCUE_FILE="$BACKUP_DIR/pre-db-restore-$(date +%Y%m%d-%H%M%S).dump"
log "Tạo bản cứu hộ database hiện tại: $RESCUE_FILE"
if ! docker compose exec -T db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$RESCUE_FILE"; then
  rm -f "$RESCUE_FILE"
  die "Không tạo được bản cứu hộ; database chưa bị thay đổi"
fi
[[ -s "$RESCUE_FILE" ]] || die "Bản cứu hộ rỗng; chưa dừng app hoặc thay đổi database"
docker compose exec -T db pg_restore --list <"$RESCUE_FILE" >/dev/null \
  || die "Bản cứu hộ không vượt qua kiểm tra pg_restore; chưa thay đổi database"

log "Dừng app và restore từ $DUMP_FILE..."
docker compose stop app

if ! restore_dump "$DUMP_FILE"; then
  log "Restore thất bại; đang phục hồi lại bản cứu hộ..."
  if restore_dump "$RESCUE_FILE"; then
    docker compose start app
    if ! wait_for_app || ! check_app_database; then
      docker compose stop app
      die "Restore đích thất bại; database cứu hộ đã phục hồi nhưng app không qua kiểm tra và đang dừng"
    fi
    die "Restore thất bại; đã phục hồi database về trạng thái ngay trước thao tác"
  fi
  die "CRITICAL: cả restore và phục hồi bản cứu hộ đều thất bại; app đang dừng"
fi

docker compose up -d --no-deps app
if ! wait_for_app || ! check_app_database; then
  docker compose stop app
  die "Database đã restore nhưng app/schema không tương thích; app đã được dừng"
fi
log "Restore database thành công. Bản cứu hộ: $RESCUE_FILE"
