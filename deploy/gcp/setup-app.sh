#!/usr/bin/env bash
# Cấu hình QLTrungTam trên host GCP sau khi đã có repo, .env và secrets/:
# pgBackRest lên GCS, khởi động DB, tạo stanza, cài systemd timer backup.
# Chạy bằng root; chạy lại không sao (idempotent). Chưa start App (để deploy script làm).
#   sudo bash /opt/QLTrungTam/deploy/gcp/setup-app.sh <gcs-bucket>

set -Eeuo pipefail

BUCKET="${1:-}"
APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/QLTrungTam}"
ENV_FILE="$APP_DIR/.env"
COMPOSE_FILE="$APP_DIR/deploy/app/docker-compose.yml"
PGBACKREST_CONF=/etc/qltrungtam/pgbackrest.conf

log() { printf '[setup-app] %s\n' "$*"; }
die() { printf '[setup-app] ERROR: %s\n' "$*" >&2; exit 1; }

compose() {
  sudo -u "$APP_USER" docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

ensure_env() {
  grep -q "^$1=" "$ENV_FILE" && return 0
  # .env copy từ host cũ có thể thiếu newline cuối; không được nối dính vào dòng trước.
  [[ -z "$(tail -c1 "$ENV_FILE")" ]] || echo >>"$ENV_FILE"
  printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
}

[[ "$EUID" -eq 0 ]] || die "Chạy bằng sudo/root"
[[ "$BUCKET" =~ ^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$ ]] || die "Cách dùng: setup-app.sh <gcs-bucket>"
[[ -f "$COMPOSE_FILE" ]] || die "Chưa có repo ở $APP_DIR (chạy bootstrap-vm.sh trước)"
[[ -s "$ENV_FILE" ]] || die "Thiếu $ENV_FILE"
[[ -s "$APP_DIR/secrets/postgres_exporter_password.txt" ]] || die "Thiếu secrets/postgres_exporter_password.txt"
grep -Eq '^SEED_DEMO="?false"?$' "$ENV_FILE" || die "Production phải có SEED_DEMO=false trong .env"

log "Chuẩn hoá quyền .env và secrets/"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 0600 "$ENV_FILE"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/secrets"
chmod 0700 "$APP_DIR/secrets"
# Compose secret dạng file được bind mount nguyên quyền host; postgres (uid 999) và
# postgres-exporter (nobody) phải đọc được. Thư mục 0700 chặn user khác trên host.
chmod 0644 "$APP_DIR"/secrets/*.txt

ensure_env EXPORTER_BIND_IP 127.0.0.1
ensure_env PGBACKREST_CONF "$PGBACKREST_CONF"

log "Render $PGBACKREST_CONF (bucket $BUCKET)"
install -d -m 0755 "$(dirname "$PGBACKREST_CONF")"
tmp="$(mktemp)"
sed "s/__GCS_BUCKET__/$BUCKET/" "$APP_DIR/deploy/app/postgres/pgbackrest.gcs.conf" >"$tmp"
install -m 0644 "$tmp" "$PGBACKREST_CONF"
rm -f "$tmp"

log "Build và khởi động db + exporters"
compose up -d --build db node-exporter postgres-exporter
for _ in $(seq 1 30); do
  compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 && break
  sleep 2
done
compose exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null || die "PostgreSQL chưa sẵn sàng"

log "pgBackRest stanza-create + check trên GCS"
compose exec -T --user postgres db pgbackrest --stanza=qltrungtam stanza-create
compose exec -T --user postgres db pgbackrest --stanza=qltrungtam check

log "Cài systemd timer backup"
install -m 0644 "$APP_DIR"/deploy/app/systemd/qltrungtam-pgbackrest* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now qltrungtam-pgbackrest-full.timer qltrungtam-pgbackrest-diff.timer
systemctl list-timers 'qltrungtam-pgbackrest-*' --no-pager

log "Xong. Bước tiếp (user $APP_USER): cd $APP_DIR && FORCE_DEPLOY=1 bash scripts/deploy-ec2.sh dev"
