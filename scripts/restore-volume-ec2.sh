#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
STATE_DIR="$APP_DIR/.deploy"
BACKUP_DIR="$APP_DIR/backups"
DB_VOLUME_NAME="${DB_VOLUME_NAME:-qltrungtam_db_data}"
EXPECTED_POSTGRES_MAJOR="${EXPECTED_POSTGRES_MAJOR:-16}"
RESTORE_CONTAINER="qltt-volume-restore-$$"

log() {
  printf '[restore-volume] %s\n' "$*"
}

die() {
  printf '[restore-volume] ERROR: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  docker rm -f "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
}

trap cleanup EXIT
trap 'exit 130' INT TERM

cd "$APP_DIR"

[[ "${CONFIRM_VOLUME_RESTORE:-}" == "YES" ]] \
  || die "Restore volume sẽ thay toàn bộ database. Chạy lại với CONFIRM_VOLUME_RESTORE=YES"

BACKUP_FILE="${1:-${BACKUP_FILE:-}}"
[[ -n "$BACKUP_FILE" ]] \
  || die "Cách dùng: CONFIRM_VOLUME_RESTORE=YES bash .deploy/restore-volume-ec2.sh db_data-YYYYMMDD-HHMMSS.tar.gz"
case "$BACKUP_FILE" in
  */* | . | ..) die "Chỉ truyền tên file nằm trực tiếp trong backups/" ;;
esac
[[ "$BACKUP_FILE" =~ ^[A-Za-z0-9._-]+\.tar\.gz$ ]] \
  || die "Tên backup phải có dạng an toàn và kết thúc bằng .tar.gz"
[[ "$DB_VOLUME_NAME" =~ ^[A-Za-z0-9_.-]+$ ]] || die "Tên Docker volume không hợp lệ"
[[ "$EXPECTED_POSTGRES_MAJOR" =~ ^[0-9]+$ ]] || die "EXPECTED_POSTGRES_MAJOR không hợp lệ"

for command_name in docker flock; do
  command -v "$command_name" >/dev/null 2>&1 || die "Thiếu lệnh: $command_name"
done

BACKUP_PATH="$BACKUP_DIR/$BACKUP_FILE"
[[ -s "$BACKUP_PATH" ]] || die "Không tìm thấy backup hoặc file rỗng: $BACKUP_PATH"

mkdir -p "$STATE_DIR" "$BACKUP_DIR"
exec 9>"$STATE_DIR/deploy.lock"
flock -n 9 || die "Một tiến trình deploy/rollback/restore khác đang chạy"

docker volume inspect "$DB_VOLUME_NAME" >/dev/null 2>&1 \
  || die "Không tìm thấy Docker volume: $DB_VOLUME_NAME"
VOLUME_USERS="$(docker ps -q --filter "volume=$DB_VOLUME_NAME")"
[[ -z "$VOLUME_USERS" ]] \
  || die "Docker volume vẫn đang được container sử dụng. Hãy dừng app và db trước khi restore"

log "Đang kiểm tra backup và tạo bản cứu hộ trước khi thay volume..."
if ! docker run --rm \
  --name "$RESTORE_CONTAINER" \
  --mount "type=volume,source=$DB_VOLUME_NAME,target=/volume" \
  --mount "type=bind,source=$BACKUP_DIR,target=/backups" \
  -e BACKUP_FILE="$BACKUP_FILE" \
  -e EXPECTED_POSTGRES_MAJOR="$EXPECTED_POSTGRES_MAJOR" \
  alpine:3.20 sh -ceu '
    test ! -e /volume/postmaster.pid || {
      echo "PostgreSQL chưa dừng sạch: còn postmaster.pid" >&2
      exit 1
    }

    backup_path="/backups/$BACKUP_FILE"
    tar tzf "$backup_path" > /tmp/restore-list
    ! grep -Eq "(^/|(^|/)\.\.(/|$))" /tmp/restore-list || {
      echo "Backup chứa đường dẫn không an toàn" >&2
      exit 1
    }
    ! grep -Eq "(^|/)postmaster\.pid$" /tmp/restore-list || {
      echo "Backup được tạo khi PostgreSQL có vẻ đang chạy" >&2
      exit 1
    }
    pg_version_entry="$(grep -E "^(\./)?PG_VERSION$" /tmp/restore-list | head -n 1)"
    test -n "$pg_version_entry" || {
      echo "Backup không có PG_VERSION ở gốc PGDATA" >&2
      exit 1
    }
    grep -Eq "^(\./)?global/pg_control$" /tmp/restore-list || {
      echo "Backup không có global/pg_control" >&2
      exit 1
    }
    grep -Eq "^(\./)?base/?$" /tmp/restore-list || {
      echo "Backup không có thư mục base/" >&2
      exit 1
    }
    archived_major="$(tar xOzf "$backup_path" "$pg_version_entry" | tr -d "[:space:]")"
    test "$archived_major" = "$EXPECTED_POSTGRES_MAJOR" || {
      echo "Backup là PostgreSQL $archived_major, yêu cầu major $EXPECTED_POSTGRES_MAJOR" >&2
      exit 1
    }

    rescue="/backups/pre-volume-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
    tar czf "$rescue" -C /volume .
    tar tzf "$rescue" >/dev/null
    echo "Created and validated rescue backup: $rescue"

    restore_started=0
    recover_on_exit() {
      exit_code=$?
      trap - EXIT INT TERM HUP
      if [ "$restore_started" -eq 1 ]; then
        echo "Target restore failed or was interrupted; restoring rescue backup" >&2
        rm -rf /volume/* /volume/.[!.]* /volume/..?* 2>/dev/null || true
        if tar xzf "$rescue" -C /volume; then
          echo "Rescue backup restored" >&2
        else
          echo "CRITICAL: rescue restore also failed: $rescue" >&2
        fi
      fi
      exit "$exit_code"
    }
    trap recover_on_exit EXIT
    trap "exit 130" INT
    trap "exit 143" TERM HUP

    restore_started=1
    rm -rf /volume/* /volume/.[!.]* /volume/..?* 2>/dev/null || true
    tar xzf "$backup_path" -C /volume
    test -f /volume/PG_VERSION
    test "$(tr -d "[:space:]" < /volume/PG_VERSION)" = "$EXPECTED_POSTGRES_MAJOR"
    test -f /volume/global/pg_control
    test -d /volume/base
    restore_started=0
    trap - EXIT INT TERM HUP
  '; then
  die "Restore volume thất bại; xem thông báo cứu hộ ở trên"
fi

trap - EXIT INT TERM
log "Restore volume thành công từ $BACKUP_PATH"
log "Hãy khởi động db/app rồi kiểm tra /api/health trước khi mở lại truy cập"
