#!/usr/bin/env bash
# Chuyển dữ liệu prod từ EC2 sang VM GCP. Chạy trên máy quản trị (cần ssh tới EC2 và gcloud).
#
#   rehearse  App EC2 vẫn chạy. Dump -> copy -> restore trên GCP -> so số dòng. Chạy bao nhiêu lần cũng được.
#   final     DỪNG App EC2 (đóng băng ghi) -> dump -> copy -> restore -> so số dòng phải khớp tuyệt đối.
#   rollback  Start lại App EC2 (dùng khi final lỗi hoặc cần quay về; nhớ trỏ DNS về IP cũ).
#   post      Sau khi DNS đã trỏ về GCP: cài Caddyfile, chờ HTTPS, chạy full backup pgBackRest.
#   rustdesk  Dừng RustDesk EC2, chuyển data + key sang GCP, start ở đó (RUSTDESK_HOST bắt buộc).
#
# Cấu hình qua biến môi trường:
#   GCP_PROJECT (bắt buộc), GCP_ZONE, GCP_VM, EC2_HOST, EC2_KEY, NEW_IP (post), RUSTDESK_HOST (rustdesk)

set -Eeuo pipefail

MODE="${1:-}"
EC2_HOST="${EC2_HOST:-ubuntu@95.41.14.32}"
EC2_KEY="${EC2_KEY:-$HOME/Documents/keypem/ec2-linh.pem}"
GCP_PROJECT="${GCP_PROJECT:-}"
GCP_ZONE="${GCP_ZONE:-asia-southeast1-a}"
GCP_VM="${GCP_VM:-qltt-prod}"
DOMAIN="${DOMAIN:-aplus.zett.io.vn}"
APP_DIR=/opt/QLTrungTam
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

log() { printf '[cutover %(%H:%M:%S)T] %s\n' -1 "$*"; }
die() { printf '[cutover] ERROR: %s\n' "$*" >&2; exit 1; }

ec2() {
  ssh -i "$EC2_KEY" -o ConnectTimeout=15 -o BatchMode=yes "$EC2_HOST" "$@"
}

# Lệnh trên VM chạy bằng user ubuntu (chủ repo, thuộc nhóm docker).
vm() {
  gcloud compute ssh "$GCP_VM" --project "$GCP_PROJECT" --zone "$GCP_ZONE" \
    --tunnel-through-iap --quiet --command "$1"
}

ec2_compose='docker compose --env-file /opt/QLTrungTam/.env -f /opt/QLTrungTam/deploy/app/docker-compose.yml'

preflight() {
  [[ -n "$GCP_PROJECT" ]] || die "Đặt GCP_PROJECT"
  command -v gcloud >/dev/null || die "Thiếu gcloud"
  [[ -r "$EC2_KEY" ]] || die "Không đọc được EC2_KEY=$EC2_KEY"
  # </dev/null: ssh không được nuốt stdin, để final còn đọc được câu trả lời YES.
  log "Kiểm tra EC2"
  ec2 "curl -fsS --max-time 5 http://127.0.0.1:3001/api/health >/dev/null || $ec2_compose ps app" >/dev/null </dev/null
  log "Kiểm tra VM GCP"
  vm "sudo -u ubuntu test -x $APP_DIR/.deploy/restore-db-ec2.sh" </dev/null \
    || die "VM chưa deploy lần đầu (thiếu .deploy/restore-db-ec2.sh)"
}

dump_and_copy() {
  local name
  name="cutover-$(date +%Y%m%d-%H%M%S).dump"
  local src_sum dst_sum

  log "pg_dump trên EC2 -> backups/$name"
  ec2 "set -euo pipefail; cd $APP_DIR
    $ec2_compose exec -T db sh -ceu 'export PGPASSWORD=\"\$POSTGRES_PASSWORD\"; pg_dump -h 127.0.0.1 -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Fc' > backups/$name
    test -s backups/$name
    $ec2_compose exec -T db pg_restore --list < backups/$name > /dev/null"
  src_sum="$(ec2 "sha256sum $APP_DIR/backups/$name" | cut -d' ' -f1)"

  log "Copy EC2 -> GCP (stream, không ghi ra máy này)"
  ec2 "cat $APP_DIR/backups/$name" \
    | vm "sudo -u ubuntu tee $APP_DIR/backups/$name > /dev/null"
  dst_sum="$(vm "sha256sum $APP_DIR/backups/$name" | cut -d' ' -f1)"
  [[ "$src_sum" == "$dst_sum" ]] || die "sha256 lệch: $src_sum != $dst_sum"
  log "sha256 khớp: ${src_sum:0:16}"

  DUMP_NAME="$name"
}

restore_on_vm() {
  log "Restore trên GCP"
  vm "cd $APP_DIR && sudo -u ubuntu env CONFIRM_DB_RESTORE=YES bash .deploy/restore-db-ec2.sh backups/$DUMP_NAME"
}

compare_counts() {
  log "So số dòng EC2 vs GCP"
  ec2 "APP_DIR=$APP_DIR bash -s" <"$SCRIPT_DIR/../../scripts/db-row-counts.sh" >"$WORK_DIR/ec2.tsv"
  vm "cd $APP_DIR && sudo -u ubuntu env APP_DIR=$APP_DIR bash scripts/db-row-counts.sh" >"$WORK_DIR/gcp.tsv"
  if diff -u "$WORK_DIR/ec2.tsv" "$WORK_DIR/gcp.tsv"; then
    log "Số dòng khớp ($(wc -l <"$WORK_DIR/ec2.tsv") dòng kết quả)"
    return 0
  fi
  return 1
}

case "$MODE" in
  rehearse)
    preflight
    dump_and_copy
    restore_on_vm
    compare_counts || log "Có chênh lệch: bình thường khi App EC2 vẫn đang nhận ghi trong lúc chạy."
    log "Rehearse xong. Kiểm thử qua tunnel: gcloud compute ssh $GCP_VM --zone $GCP_ZONE --tunnel-through-iap -- -L 3001:127.0.0.1:3001"
    ;;

  final)
    preflight
    read -r -p "Sẽ DỪNG App production trên EC2. Gõ YES để tiếp tục: " answer
    [[ "$answer" == "YES" ]] || die "Huỷ"
    log "Dừng App EC2 (DB EC2 vẫn chạy để rollback)"
    ec2 "$ec2_compose stop app"
    dump_and_copy
    restore_on_vm
    compare_counts || die "Số dòng KHÔNG khớp. Không đổi DNS. Quay lại: $0 rollback"
    cat <<EOF

[cutover] Dữ liệu đã sang GCP và khớp. Việc tay tiếp theo:
  1. Cloudflare: A record ${DOMAIN%%.*} -> IP tĩnh GCP (DNS only, TTL 60).
  2. NEW_IP=<ip> $0 post
  Lỗi trước khi có người ghi dữ liệu trên GCP -> $0 rollback + trả DNS về IP EC2.
EOF
    ;;

  rollback)
    log "Start lại App EC2"
    ec2 "$ec2_compose start app && sleep 5 && curl -fsS --max-time 10 http://127.0.0.1:3001/api/health"
    echo
    log "Nhớ trả A record ${DOMAIN%%.*} về IP EC2 trên Cloudflare."
    ;;

  post)
    [[ -n "$GCP_PROJECT" && -n "${NEW_IP:-}" ]] || die "Đặt GCP_PROJECT và NEW_IP"
    log "DNS hiện tại: $(getent hosts "$DOMAIN" | awk '{print $1}' || true) (mong đợi $NEW_IP)"
    log "Cài Caddyfile trên VM và reload"
    vm "sudo install -m 0644 $APP_DIR/deploy/app/caddy/Caddyfile /etc/caddy/Caddyfile && sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile && sudo systemctl reload caddy"
    log "Chờ HTTPS hợp lệ trên $NEW_IP"
    for _ in $(seq 1 30); do
      if curl -fsS --max-time 10 --resolve "$DOMAIN:443:$NEW_IP" "https://$DOMAIN/api/health" >/dev/null 2>&1; then
        log "HTTPS OK"
        break
      fi
      sleep 5
    done
    curl -fsS --max-time 10 --resolve "$DOMAIN:443:$NEW_IP" "https://$DOMAIN/api/health" || die "HTTPS chưa lên, xem: sudo journalctl -u caddy -n 50"
    echo
    log "Full backup pgBackRest lên GCS"
    vm "sudo systemctl start qltrungtam-pgbackrest@full.service && sudo -u ubuntu docker compose --env-file $APP_DIR/.env -f $APP_DIR/deploy/app/docker-compose.yml exec -T --user postgres db pgbackrest --stanza=qltrungtam info"
    cat <<EOF

[cutover] Còn lại (tay):
  - Smoke test: đăng nhập, dashboard, lớp/học sinh, hoá đơn, trang /pay của phụ huynh.
  - SePay: đối soát giao dịch phát sinh trong cửa sổ cutover (webhook lúc App dừng sẽ lỗi).
  - Giữ EC2 ở trạng thái App dừng ít nhất 7 ngày rồi mới dọn AWS.
EOF
    ;;

  rustdesk)
    [[ -n "$GCP_PROJECT" && -n "${RUSTDESK_HOST:-}" ]] || die "Đặt GCP_PROJECT và RUSTDESK_HOST (vd rustdesk.zett.io.vn)"
    log "Dừng RustDesk EC2 (tắt restart=always để không tự bật lại)"
    ec2 "docker update --restart=no hbbs hbbr >/dev/null && docker stop hbbs hbbr"
    log "Chuyển /home/ubuntu/rustdesk-data (key id_ed25519 + sqlite) sang GCP"
    ec2 "sudo tar czf - -C /home/ubuntu rustdesk-data" \
      | vm "sudo tar xzf - -C /home/ubuntu && sudo chmod 600 /home/ubuntu/rustdesk-data/id_ed25519"
    [[ "$(ec2 "sudo sha256sum /home/ubuntu/rustdesk-data/id_ed25519" | cut -d' ' -f1)" \
      == "$(vm "sudo sha256sum /home/ubuntu/rustdesk-data/id_ed25519" | cut -d' ' -f1)" ]] \
      || die "Key RustDesk lệch sau khi copy"
    log "Start RustDesk trên GCP, relay $RUSTDESK_HOST:21117"
    vm "cd $APP_DIR/deploy/rustdesk && printf 'RUSTDESK_RELAY=%s:21117\n' '$RUSTDESK_HOST' | sudo -u ubuntu tee .env >/dev/null && sudo -u ubuntu docker compose up -d && sudo -u ubuntu docker compose ps"
    log "Public key (client cần khớp): $(vm "sudo cat /home/ubuntu/rustdesk-data/id_ed25519.pub")"
    log "Quay lại EC2 nếu cần: docker update --restart=always hbbs hbbr && docker start hbbs hbbr"
    ;;

  *)
    sed -n '2,14p' "$0"
    exit 64
    ;;
esac
