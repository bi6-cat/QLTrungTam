# Tổng quan vận hành production

Cập nhật: 2026-08-24. Repo production đặt tại `/opt/QLTrungTam`, branch deploy
hiện tại là `dev`.

## Kiến trúc

```text
Internet -> aplus.zett.io.vn:443 -> Caddy App -> 127.0.0.1:3001 -> PostgreSQL

App EC2 10.77.0.1:9100/9187 --WireGuard--> Prometheus trên Monitoring VM
Public /api/health ------------Blackbox----> Prometheus -> Alertmanager

Internet -> monitor.zett.io.vn:443 -> Caddy Monitoring -> Grafana 127.0.0.1:3000
```

- PostgreSQL không publish host port.
- Node/Postgres exporters chỉ bind WireGuard.
- Prometheus `127.0.0.1:9090` và Alertmanager `127.0.0.1:9093` là private.
- Blackbox exporter chỉ ở Docker network.
- Grafana là monitoring UI duy nhất public, qua Caddy HTTPS.

Source of truth:

- App: `deploy/app/docker-compose.yml`.
- Monitoring: `deploy/monitoring/docker-compose.yml`.
- Caddy monitoring: `deploy/monitoring/caddy/Caddyfile`.
- Prometheus/alerts: `deploy/monitoring/prometheus/`.
- pgBackRest/systemd: `deploy/app/postgres/`, `deploy/app/systemd/`.

## Lệnh Compose chuẩn

App production luôn dùng đầy đủ:

```bash
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  <command>
```

Monitoring dùng:

```bash
docker compose \
  -f /opt/QLTrungTam/deploy/monitoring/docker-compose.yml \
  <command>
```

Không chạy Compose mặc định ở repo root và không chạy `down -v` trên production.

## Cấu hình và secret

- `.env.example` chỉ dành cho local; production dùng `/opt/QLTrungTam/.env` mode
  `0600` và `SEED_DEMO=false`.
- `.env`, `secrets/`, `backups/`, `.deploy/` đã được ignore.
- Docker secrets hiện có: password Postgres exporter, Grafana admin và Discord
  webhook cho Alertmanager.
- Discord webhook nằm trong `secrets/alertmanager_discord_webhook_url.txt`. Với
  Docker Compose file-backed secret, file phải đọc được bởi UID runtime của
  Alertmanager; thư mục `secrets/` vẫn chỉ cho `root` truy cập và secret chỉ được
  mount read-only vào service cần dùng.
- Không paste secret vào chat, issue, log hoặc command line có lưu history.
- Khi rotate DB, đổi đồng bộ DB role password, `DB_PASSWORD`, `DATABASE_URL` và
  credential exporter liên quan.

Kiểm tra metadata mà không in secret:

```bash
sudo stat -c 'owner=%U group=%G mode=%a size=%s path=%n' \
  /opt/QLTrungTam/.env
git -C /opt/QLTrungTam status --short
```

## Network và security baseline

| Port | Bind/nguồn | Public |
| --- | --- | --- |
| `22` | IP quản trị được phép | Hạn chế |
| `80/443` | Caddy App/Monitoring | Có |
| `3001` | App `127.0.0.1` | Không |
| `3000/9090/9093` | Monitoring `127.0.0.1` | Không |
| `9100/9187` | App `10.77.0.1`, qua WireGuard | Không |
| `5432` | Docker network | Không |

```bash
sudo ss -lntp
sudo ufw status verbose
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Đối chiếu thêm firewall cloud provider. Dùng SSH key, hạn chế login root, dùng
Grafana Viewer hằng ngày; admin chỉ dùng cho thay đổi. S3 backup dùng IAM Role và
IMDSv2, không lưu AWS access key trong `.env`.

## Trạng thái đã xác minh

- pgBackRest full/diff, WAL archive và restore drill thành công.
- Full Chủ nhật 02:00; diff thứ Hai-thứ Bảy 02:00 Asia/Ho_Chi_Minh.
- Năm Prometheus targets up.
- `pg_up=1`, `probe_success=1`, `node_textfile_scrape_error=0`.
- Full/diff backup success và exit code `0`; đủ 10 backup metric series.
- 10 alert rules healthy/inactive tại lần go-live.
- Prometheus thấy Alertmanager active, dropped rỗng.
- Alertmanager đã nạp Discord receiver và một controlled firing notification đã tới
  Discord. Controlled Prometheus-rule end-to-end test và quan sát riêng notification
  `resolved` được bỏ qua trong lần triển khai này.
- Grafana public HTTPS hoạt động.
- Dashboard `QLTrungTam SRE Overview` được provision từ Git với health, resource,
  HTTP probe, PostgreSQL, WAL và backup panels.

Restore drill kiểm tra WAL replay/promote, `pg_is_in_recovery()=false`, 11 migrations,
row-count sanity và full `pg_dump`; container/volume drill đã cleanup và production DB
vẫn healthy.

## Việc còn mở

1. Liên kết alert annotations tới runbook phù hợp.
2. Kiểm tra resource usage/retention sau đủ chu kỳ bảy ngày.
3. Mở rộng CI để validate cấu hình vận hành; CD làm sau bằng GitHub OIDC + AWS SSM
   có approval.
4. Rotate DB/admin/session/API secrets sau maintenance planning.

## Triage sự cố nhanh

```bash
date --iso-8601=seconds
uptime
free -h
df -h
sudo ss -lntp
git -C /opt/QLTrungTam rev-parse --short HEAD
git -C /opt/QLTrungTam status --short
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Kiểm tra theo lớp: local health trước, public health sau. Phân biệt `up=0` (không
scrape được exporter) với `pg_up=0` (exporter sống nhưng không kết nối DB). Giảm tác
động trước, giữ timeline/commit/log, rồi mới điều tra root cause; không reset secret
hoặc restore DB khi chưa có bằng chứng.

## Checklist trước/sau thay đổi production

- [ ] Working tree sạch; commit/branch được ghi lại.
- [ ] Compose, Caddy, Prometheus rules và Alertmanager config validate thành công.
- [ ] Listener/firewall khớp port matrix; secret không nằm trong Git.
- [ ] App/DB healthy; local và public health thành công.
- [ ] Backup gần nhất thành công; timers active; không có WAL failure mới.
- [ ] Năm targets up; alert rules healthy; Alertmanager active.
- [ ] Smoke test nghiệp vụ trong phạm vi release thành công.
- [ ] Có rollback target, cửa sổ quan sát và ghi nhận kết quả thay đổi.

Runbook chi tiết:

- [Deploy/rollback App](runbooks/APP-DEPLOY-ROLLBACK.md)
- [Backup/restore PostgreSQL](runbooks/POSTGRES-BACKUP-RESTORE.md)
- [Monitoring](runbooks/MONITORING.md)
