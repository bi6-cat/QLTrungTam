# QLTrungTam

Ứng dụng quản lý trung tâm dạy thêm và thu học phí qua VietQR/SePay, xây dựng bằng
Next.js, Prisma và PostgreSQL.

## Chạy local bằng Docker

Yêu cầu Docker Engine/Desktop có Compose plugin. Host không cần cài Node.js.

```powershell
Copy-Item .env.example .env
New-Item -ItemType Directory -Force secrets | Out-Null
[guid]::NewGuid().ToString("N") | Set-Content -NoNewline secrets/postgres_exporter_password.txt
[guid]::NewGuid().ToString("N") | Set-Content -NoNewline secrets/grafana_admin_password.txt
docker network create qltrungtam-observability
docker compose -f docker-compose.app.dev.yml up -d
docker compose -f docker-compose.monitoring.dev.yml up -d
```

Nếu network đã tồn tại, `docker network create` sẽ báo lỗi vô hại; không cần tạo lại.
`.env.example` và credential sinh ở trên chỉ dành cho local. Trước khi seed, kiểm tra
`SEED_DEMO`; giá trị khác `false` cho phép seed dữ liệu demo.

Kiểm tra:

```powershell
docker compose -f docker-compose.app.dev.yml ps
docker compose -f docker-compose.monitoring.dev.yml ps
```

Endpoints local:

- App: <http://127.0.0.1:3001>
- Grafana: <http://127.0.0.1:3002>
- Prometheus: <http://127.0.0.1:9090>
- PostgreSQL: `127.0.0.1:5433`

Không chạy `docker compose down -v` nếu muốn giữ dữ liệu trong named volumes.

## Lệnh kiểm tra chất lượng

```bash
npm ci
npm run prisma:validate
npm run typecheck
npm test
npm run build
```

Integration tests cần database test theo hướng dẫn trong [tests/README.md](tests/README.md).

## Tài liệu

- [Tổng quan vận hành, kiến trúc, security và checklist](docs/OPERATIONS.md)
- [Deploy/rollback](docs/runbooks/APP-DEPLOY-ROLLBACK.md)
- [Backup/restore PostgreSQL](docs/runbooks/POSTGRES-BACKUP-RESTORE.md)
- [Monitoring](docs/runbooks/MONITORING.md)

## Quy ước production quan trọng

App production luôn dùng:

```bash
docker compose \
  --env-file /opt/QLTrungTam/.env \
  -f /opt/QLTrungTam/deploy/app/docker-compose.yml \
  <command>
```

Không commit `.env`, `secrets/`, `backups/` hoặc `.deploy/`. Không paste secret vào
issue, pull request, chat hay log vận hành.
