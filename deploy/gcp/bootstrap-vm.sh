#!/usr/bin/env bash
# Chuẩn bị VM Ubuntu 24.04 mới cho QLTrungTam: swap, Docker, Caddy, user ubuntu, clone repo.
# Chạy một lần bằng root; chạy lại không sao (idempotent).
#   curl -fsSL https://raw.githubusercontent.com/bi6-cat/QLTrungTam/dev/deploy/gcp/bootstrap-vm.sh | sudo bash

set -Eeuo pipefail

APP_USER="${APP_USER:-ubuntu}"
APP_DIR="${APP_DIR:-/opt/QLTrungTam}"
REPO_URL="${REPO_URL:-https://github.com/bi6-cat/QLTrungTam.git}"
BRANCH="${BRANCH:-dev}"
export DEBIAN_FRONTEND=noninteractive

log() { printf '[bootstrap] %s\n' "$*"; }

[[ "$EUID" -eq 0 ]] || { echo "Chạy bằng sudo/root" >&2; exit 1; }

# e2-small chỉ có 2 GB RAM; next build có thể vượt mức đó nên cần swap.
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  log "Tạo swap 2G"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
echo 'vm.swappiness=10' >/etc/sysctl.d/99-qltrungtam.conf
sysctl -q --system

log "Cài gói nền"
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git jq

install -m 0755 -d /etc/apt/keyrings
if [[ ! -f /etc/apt/sources.list.d/docker.list ]]; then
  log "Thêm apt repo Docker"
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
fi
if [[ ! -f /etc/apt/sources.list.d/caddy-stable.list ]]; then
  log "Thêm apt repo Caddy"
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    >/etc/apt/sources.list.d/caddy-stable.list
  chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
fi

log "Cài Docker và Caddy"
apt-get update -q
apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin caddy
systemctl enable --now docker caddy

# Giữ đúng user của EC2 vì systemd unit backup chạy bằng User=ubuntu.
if ! id "$APP_USER" >/dev/null 2>&1; then
  log "Tạo user $APP_USER"
  useradd --create-home --shell /bin/bash "$APP_USER"
fi
usermod -aG docker "$APP_USER"

if [[ ! -d "$APP_DIR/.git" ]]; then
  log "Clone $REPO_URL ($BRANCH) vào $APP_DIR"
  install -d -o "$APP_USER" -g "$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
install -d -o "$APP_USER" -g "$APP_USER" -m 0700 "$APP_DIR/secrets"
install -d -o "$APP_USER" -g "$APP_USER" -m 0755 "$APP_DIR/backups"
install -d -m 0755 /etc/qltrungtam /var/lib/qltrungtam-pgbackrest

log "Xong. Bước tiếp: copy .env + secrets/ rồi chạy deploy/gcp/setup-app.sh"
docker --version
docker compose version
caddy version
