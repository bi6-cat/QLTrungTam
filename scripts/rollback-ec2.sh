#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

APP_DIR="${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/login}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
STATE_DIR="$APP_DIR/.deploy"
BACKUP_DIR="$APP_DIR/backups"
START_COMMIT=""
CODE_SWITCHED=0

log() {
  printf '[rollback] %s\n' "$*"
}

die() {
  printf '[rollback] ERROR: %s\n' "$*" >&2
  exit 1
}

wait_for_app() {
  local attempt
  for ((attempt = 1; attempt <= HEALTH_RETRIES; attempt++)); do
    if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done

  docker compose logs --tail=100 app >&2 || true
  return 1
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

return_to_start_on_error() {
  local exit_code="$1"
  trap - ERR INT TERM

  if [[ "$CODE_SWITCHED" -eq 1 && -n "$START_COMMIT" ]]; then
    log "Rollback lỗi. Đang thử đưa ứng dụng lại commit ban đầu ${START_COMMIT:0:12}..."
    git checkout --detach "$START_COMMIT" || true
    docker compose build app || true
    docker compose up -d --no-deps app || true
  fi
  exit "$exit_code"
}

trap 'return_to_start_on_error $?' ERR
trap 'return_to_start_on_error 130' INT TERM

cd "$APP_DIR"

for command_name in git docker curl flock; do
  command -v "$command_name" >/dev/null 2>&1 || die "Thiếu lệnh: $command_name"
done
docker compose version >/dev/null 2>&1 || die "Docker Compose plugin chưa được cài"
[[ -f .env ]] || die "Không tìm thấy $APP_DIR/.env"
[[ "$HEALTH_RETRIES" =~ ^[1-9][0-9]*$ ]] || die "HEALTH_RETRIES phải là số nguyên dương"
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || die "Working tree có thay đổi. Hãy commit/stash trước khi rollback"

mkdir -p "$STATE_DIR" "$BACKUP_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "Một tiến trình deploy/rollback khác đang chạy"

if [[ -n "${1:-}" ]]; then
  TARGET_INPUT="$1"
elif [[ -f "$STATE_DIR/state.env" ]]; then
  # File do deploy-ec2.sh tạo và chỉ chứa các giá trị đã escape bằng printf %q.
  # shellcheck disable=SC1091
  source "$STATE_DIR/state.env"
  TARGET_INPUT="${PREVIOUS_COMMIT:-}"
else
  die "Thiếu commit cần rollback. Ví dụ: bash scripts/rollback-ec2.sh abc1234"
fi

[[ -n "$TARGET_INPUT" ]] || die "Không tìm thấy phiên bản trước trong state"
TARGET_COMMIT="$(git rev-parse --verify --end-of-options "${TARGET_INPUT}^{commit}")" || die "Commit không hợp lệ: $TARGET_INPUT"
START_COMMIT="$(git rev-parse HEAD)"

if [[ "$TARGET_COMMIT" == "$START_COMMIT" ]]; then
  log "Ứng dụng đã ở commit ${TARGET_COMMIT:0:12}; không cần rollback"
  exit 0
fi

docker compose up -d db
wait_for_db || die "PostgreSQL chưa sẵn sàng"
BACKUP_FILE="$BACKUP_DIR/pre-rollback-$(date +%Y%m%d-%H%M%S)-${START_COMMIT:0:12}.dump"
log "Backup database hiện tại vào $BACKUP_FILE..."
if ! docker compose exec -T db sh -ceu \
  'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_dump -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  >"$BACKUP_FILE"; then
  rm -f "$BACKUP_FILE"
  die "Backup database thất bại; chưa rollback"
fi
[[ -s "$BACKUP_FILE" ]] || die "File backup rỗng; dừng rollback"

log "Đang rollback ứng dụng ${START_COMMIT:0:12} -> ${TARGET_COMMIT:0:12}..."
git checkout --detach "$TARGET_COMMIT"
CODE_SWITCHED=1
docker compose build app
docker compose up -d --no-deps app
wait_for_app

TMP_STATE="$STATE_DIR/state.env.tmp"
{
  printf 'CURRENT_COMMIT=%q\n' "$TARGET_COMMIT"
  printf 'PREVIOUS_COMMIT=%q\n' "$START_COMMIT"
  printf 'PRE_ROLLBACK_BACKUP=%q\n' "$BACKUP_FILE"
  printf 'DEPLOYED_AT=%q\n' "$(date --iso-8601=seconds)"
} >"$TMP_STATE"
mv "$TMP_STATE" "$STATE_DIR/state.env"

CODE_SWITCHED=0
trap - ERR INT TERM
log "Rollback ứng dụng thành công về ${TARGET_COMMIT:0:12}"
log "Database chưa bị restore. Nếu migration không tương thích, xem docs/EC2-UPDATE-ROLLBACK.md"
