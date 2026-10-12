#!/usr/bin/env bash
# Khởi chạy MCP server cho Claude (stdio) qua Docker, tuỳ chọn mở SSH tunnel tới DB trên EC2.
# stdout chỉ dành cho giao thức MCP nên mọi thông báo đều ghi ra stderr.
#
# Cấu hình lấy từ biến môi trường hoặc file mcp/.env.local (không commit), xem mcp/README.md:
#   DATABASE_URL        bắt buộc; trỏ 127.0.0.1:<cổng> (cổng tunnel hoặc DB dev)
#   SSH_HOST            vd ubuntu@95.40.230.150; có giá trị thì script tự mở tunnel
#   SSH_KEY             đường dẫn file .pem
#   DB_CONTAINER        tên container Postgres trên server (mặc định qltrungtam-db-1)
#   MCP_ALLOW_WRITE     "true" để bật tool sửa hồ sơ học sinh (mặc định chỉ đọc)
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${MCP_IMAGE:-qltrungtam-mcp}"
log() { printf '[mcp-launcher] %s\n' "$*" >&2; }
die() { log "LỖI: $*"; exit 1; }

# Nạp file cấu hình cục bộ nhưng không ghi đè biến đã đặt sẵn trong môi trường.
if [[ -f "$ROOT/mcp/.env.local" ]]; then
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" == \#* ]] && continue
    value="${value%\"}"; value="${value#\"}"
    [[ -z "${!key:-}" ]] && export "$key=$value"
  done < "$ROOT/mcp/.env.local"
fi

[[ -n "${DATABASE_URL:-}" ]] || die "Thiếu DATABASE_URL (đặt trong mcp/.env.local)."
command -v docker >/dev/null || die "Chưa cài Docker."

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  log "Chưa có image $IMAGE, đang build (chỉ lần đầu)..."
  docker build -q -f "$ROOT/mcp/Dockerfile" -t "$IMAGE" "$ROOT" >&2
fi

TUNNEL_PID=""
cleanup() { [[ -n "$TUNNEL_PID" ]] && kill "$TUNNEL_PID" 2>/dev/null || true; }
trap cleanup EXIT

if [[ -n "${SSH_HOST:-}" ]]; then
  [[ -n "${SSH_KEY:-}" && -f "${SSH_KEY/#\~/$HOME}" ]] || die "SSH_KEY không trỏ tới file .pem tồn tại."
  KEY="${SSH_KEY/#\~/$HOME}"
  SSH_OPTS=(-i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
  # Cổng local lấy từ DATABASE_URL để hai bên luôn khớp.
  PORT="$(sed -E 's#^[a-z]+://[^@]*@[^:/]+:([0-9]+)/.*#\1#' <<<"$DATABASE_URL")"
  [[ "$PORT" =~ ^[0-9]+$ ]] || die "Không đọc được cổng từ DATABASE_URL."

  # DB trên server không publish cổng ra ngoài nên cần IP container trong mạng docker.
  DB_IP="${DB_CONTAINER_IP:-}"
  if [[ -z "$DB_IP" ]]; then
    DB_IP="$(ssh -n "${SSH_OPTS[@]}" "$SSH_HOST" \
      "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' ${DB_CONTAINER:-qltrungtam-db-1}")" \
      || die "Không SSH được tới $SSH_HOST."
  fi
  [[ "$DB_IP" =~ ^[0-9.]+$ ]] || die "Không lấy được IP container DB (nhận: '$DB_IP')."

  # Mọi lệnh ssh phải không đọc stdin (-n hoặc </dev/null): đó là kênh giao thức MCP với Claude.
  ssh "${SSH_OPTS[@]}" -N -L "127.0.0.1:${PORT}:${DB_IP}:5432" \
    -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 "$SSH_HOST" </dev/null &
  TUNNEL_PID=$!
  for _ in $(seq 1 30); do
    (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") 2>/dev/null && break
    kill -0 "$TUNNEL_PID" 2>/dev/null || die "SSH tunnel đã thoát."
    sleep 0.5
  done
  log "Tunnel sẵn sàng: 127.0.0.1:${PORT} -> ${DB_IP}:5432"
fi

# Linux dùng mạng host để container thấy 127.0.0.1; macOS/Windows (Docker Desktop) đi qua host.docker.internal.
NET_ARGS=(--network host)
CONTAINER_DB_URL="$DATABASE_URL"
if [[ "$(uname -s)" != "Linux" ]]; then
  NET_ARGS=(--add-host host.docker.internal:host-gateway)
  CONTAINER_DB_URL="${DATABASE_URL//127.0.0.1/host.docker.internal}"
fi

# Không dùng exec để trap EXIT còn đóng được tunnel khi container kết thúc.
docker run -i --rm "${NET_ARGS[@]}" \
  -e DATABASE_URL="$CONTAINER_DB_URL" \
  -e MCP_ALLOW_WRITE="${MCP_ALLOW_WRITE:-false}" \
  -e NODE_ENV=production \
  "$IMAGE"
