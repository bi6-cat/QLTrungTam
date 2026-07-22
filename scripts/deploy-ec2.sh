#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BRANCH="${1:-${DEPLOY_BRANCH:-main}}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
ROLLBACK_HEALTH_URL="${ROLLBACK_HEALTH_URL:-http://127.0.0.1:3001/login}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
STATE_DIR="$APP_DIR/.deploy"
BACKUP_DIR="$APP_DIR/backups"
CODE_SWITCHED=0
OLD_COMMIT=""

log() {
  printf '[deploy] %s\n' "$*"
}

die() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
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
  local health_url="${1:-$HEALTH_URL}"
  local attempt
  for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$health_url" >/dev/null 2>&1; then
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

preserve_operation_scripts() {
  local script_name
  local scripts=(deploy-ec2.sh rollback-ec2.sh restore-db-ec2.sh restore-volume-ec2.sh)
  for script_name in "${scripts[@]}"; do
    if [[ ! -f "$APP_DIR/scripts/$script_name" ]]; then
      printf '[deploy] ERROR: thiếu script vận hành: scripts/%s\n' "$script_name" >&2
      return 1
    fi
  done
  for script_name in "${scripts[@]}"; do
    cp "$APP_DIR/scripts/$script_name" "$STATE_DIR/$script_name.tmp"
    chmod 700 "$STATE_DIR/$script_name.tmp"
  done
  for script_name in "${scripts[@]}"; do
    mv "$STATE_DIR/$script_name.tmp" "$STATE_DIR/$script_name"
  done
}

write_state() {
  local current_commit="$1"
  local previous_commit="$2"
  local backup_file="$3"
  local tmp_file="$STATE_DIR/state.env.tmp"

  {
    printf 'CURRENT_COMMIT=%q\n' "$current_commit"
    printf 'PREVIOUS_COMMIT=%q\n' "$previous_commit"
    printf 'PRE_DEPLOY_BACKUP=%q\n' "$backup_file"
    printf 'DEPLOYED_AT=%q\n' "$(date --iso-8601=seconds)"
    printf 'DEPLOY_BRANCH=%q\n' "$BRANCH"
  } >"$tmp_file"
  mv "$tmp_file" "$STATE_DIR/state.env"
}

rollback_on_error() {
  local exit_code="$1"
  trap - ERR INT TERM

  if [[ "$CODE_SWITCHED" -eq 1 && -n "$OLD_COMMIT" ]]; then
    log "Deploy lỗi. Đang tự động rollback ứng dụng về ${OLD_COMMIT:0:12}..."
    if git checkout --detach "$OLD_COMMIT" \
      && docker compose build app \
      && docker compose up -d --no-deps app \
      && wait_for_app "$ROLLBACK_HEALTH_URL" \
      && check_app_database; then
      log "Đã rollback ứng dụng thành công. Database chưa bị restore."
    else
      printf '[deploy] CRITICAL: rollback tự động thất bại. Chạy: FORCE_RECREATE=YES bash .deploy/rollback-ec2.sh %s\n' "$OLD_COMMIT" >&2
    fi
  fi

  exit "$exit_code"
}

trap 'rollback_on_error $?' ERR
trap 'rollback_on_error 130' INT TERM

cd "$APP_DIR"

for command_name in git docker curl flock cp chmod mv; do
  command -v "$command_name" >/dev/null 2>&1 || die "Thiếu lệnh: $command_name"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin chưa được cài"
[[ -f .env ]] || die "Không tìm thấy $APP_DIR/.env"
[[ "$BRANCH" =~ ^[A-Za-z0-9._/-]+$ ]] || die "Tên branch không hợp lệ: $BRANCH"
[[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "HEALTH_RETRIES phải là số nguyên dương"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || die "Working tree có thay đổi. Hãy commit/stash trước khi deploy"

mkdir -p "$STATE_DIR" "$BACKUP_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "Một tiến trình deploy/rollback khác đang chạy"

OLD_COMMIT="$(git rev-parse HEAD)"
log "Đang lấy origin/$BRANCH..."
git fetch --prune origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
TARGET_COMMIT="$(git rev-parse --verify "refs/remotes/origin/$BRANCH^{commit}")"

if [[ "$TARGET_COMMIT" == "$OLD_COMMIT" && "${FORCE_DEPLOY:-0}" != "1" ]]; then
  log "EC2 đã ở phiên bản mới nhất: ${TARGET_COMMIT:0:12}"
  exit 0
fi

log "Phiên bản hiện tại: ${OLD_COMMIT:0:12}"
log "Phiên bản sẽ deploy: ${TARGET_COMMIT:0:12}"

docker compose up -d db
wait_for_db || die "PostgreSQL chưa sẵn sàng"

BACKUP_FILE="$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S)-${OLD_COMMIT:0:12}.dump"
log "Đang backup database vào $BACKUP_FILE..."
if ! docker compose exec -T db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  die "Backup database thất bại; chưa thay đổi phiên bản"
fi
[[ -s "$BACKUP_FILE" ]] || die "File backup rỗng; dừng deploy"
docker compose exec -T db pg_restore --list <"$BACKUP_FILE" >/dev/null \
  || die "File backup không vượt qua kiểm tra pg_restore; dừng deploy"

log "Đang checkout commit mới..."
git checkout --detach "$TARGET_COMMIT"
CODE_SWITCHED=1
preserve_operation_scripts

log "Đang build image ứng dụng..."
docker compose build app

log "Đang chạy Prisma migrations và đối soát dữ liệu tài chính..."
docker compose --profile tools run --rm migrate \
  sh -ceu 'npm ci && npx prisma migrate deploy && npm run audit:data'

log "Đang thay container ứng dụng..."
docker compose up -d --no-deps app

log "Đang kiểm tra $HEALTH_URL..."
wait_for_app
check_app_database

write_state "$TARGET_COMMIT" "$OLD_COMMIT" "$BACKUP_FILE"
CODE_SWITCHED=0
trap - ERR INT TERM

log "Deploy thành công: ${TARGET_COMMIT:0:12}"
log "Backup trước deploy: $BACKUP_FILE"
log "Rollback ứng dụng: bash .deploy/rollback-ec2.sh ${OLD_COMMIT}"
log "Bộ script vận hành ổn định: $STATE_DIR/"
