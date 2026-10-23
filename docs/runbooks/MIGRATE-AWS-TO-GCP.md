# Runbook chuyển production EC2 → GCP

Lập: 2026-10-23. Lý do: tài khoản AWS sắp hết hạn. GCP chỉ là chỗ ở tạm trong thời gian còn
credit Free Trial (hết khoảng **2026-12-24**), sau đó chuyển sang một tài khoản AWS mới. Vì vậy
mọi thay đổi trong repo đều giữ chạy được trên EC2 (mặc định vẫn là S3 + WireGuard IP).

## 1. Hiện trạng (kiểm tra 2026-10-23)

| Mục | Giá trị |
| --- | --- |
| Host | EC2 `t3.small`, `ap-east-1`, Ubuntu 26.04, IP `95.41.14.32` |
| App | Compose `deploy/app`, commit `61fa844` = `origin/dev` |
| DB | PostgreSQL 16, 10 MB, migration cuối `20261015090000_survey_min_group_default` |
| Backup | pgBackRest → S3 (IAM Role), full CN + diff hằng ngày, OK đến 2026-10-22 |
| Proxy | Caddy trên host, Caddyfile trước đây không có trong Git |
| RustDesk | `hbbs`/`hbbr` chạy bằng `docker run` tay, data `/home/ubuntu/rustdesk-data`, relay `95.41.14.32:21117` |
| Monitoring | **Không hoạt động**: WireGuard tới monitoring VM handshake cuối cách đây 59 ngày, `monitor.zett.io.vn` không còn DNS |

Số dòng mốc lúc lập runbook: `Student 104`, `Enrollment 127`, `MonthlyInvoice 302`,
`Transaction 277`, `AuditLog 382`.

## 2. Đích

```text
Cloudflare: aplus.zett.io.vn, rustdesk.zett.io.vn ─→ 1 IP tĩnh
  └─ VM qltt-prod (e2-small: 2 vCPU chia sẻ, 2 GB; Ubuntu 24.04; asia-southeast1-a)
       ├─ Caddy (host) → 127.0.0.1:3001 App → db           (Compose y như EC2)
       ├─ RustDesk hbbs/hbbr                               (deploy/rustdesk)
       └─ pgBackRest → GCS bucket, xác thực bằng service account của VM (không có key)
Cloud Monitoring uptime check /api/health → email
Snapshot boot disk hằng ngày, giữ 7 ngày
```

- Project riêng (`qltt-prod-…`), dùng chung billing account với lab để hưởng credit. Không đặt chung
  với project lab vì lab hay `destroy` và có quy tắc không dùng data prod.
- Chi phí ước tính khoảng $23/tháng theo giá Billing Catalog 2026-10 (VM e2-small $15,1, disk 32 GB $3,5, IP $3,65, snapshot + GCS + egress < $1), ngang EC2 hiện tại.
  Kiểm lại bằng Pricing Calculator. Trừ vào credit trial; budget $150 dùng chung với lab.
- e2-small tốn 2 vCPU quota: lab phương án A (10) + prod (2) = 12, vừa khít. Lab cần thêm thì đổi
  `machine_type` sang `t2d-standard-1` (1 vCPU quota, giá gần gấp đôi).

Thay đổi trong repo:

| File | Nội dung |
| --- | --- |
| `deploy/app/docker-compose.yml` | `PGBACKREST_CONF`, `EXPORTER_BIND_IP` (mặc định giữ giá trị EC2) |
| `deploy/app/postgres/pgbackrest.gcs.conf` | Template pgBackRest cho GCS |
| `deploy/app/caddy/Caddyfile` | Caddyfile App |
| `deploy/rustdesk/docker-compose.yml` | RustDesk, pin digest đang chạy |
| `deploy/gcp/terraform/` | VPC, firewall, IP, SA, bucket, VM, snapshot, uptime check |
| `deploy/gcp/bootstrap-vm.sh` | Swap, Docker, Caddy, user `ubuntu`, clone repo |
| `deploy/gcp/setup-app.sh` | Render pgBackRest, start db, stanza-create, timer backup |
| `deploy/gcp/cutover.sh` | `rehearse` / `final` / `rollback` / `post` / `rustdesk` |
| `scripts/db-row-counts.sh` | Đếm dòng từng bảng để so 2 bên |

## 3. P1 · Hạ tầng GCP

Máy quản trị cần `gcloud` và `terraform` (hoặc dùng Cloud Shell cho bước này).

```bash
export P=qltt-prod-<hậu-tố>
gcloud projects create "$P" --name="QLTT Prod"
gcloud billing accounts list
gcloud billing projects link "$P" --billing-account=<BILLING_ID>
gcloud services enable compute.googleapis.com storage.googleapis.com --project "$P"
gcloud storage buckets create "gs://$P-tfstate" --project "$P" \
  --location=asia-southeast1 --uniform-bucket-level-access
gcloud storage buckets update "gs://$P-tfstate" --versioning
gcloud compute project-info describe --project "$P" \
  --flatten=quotas --format="table(quotas.metric,quotas.usage,quotas.limit)" \
  | grep -E "METRIC|CPUS_ALL_REGIONS|IN_USE_ADDRESSES"   # describe không nhận --filter

cd deploy/gcp/terraform
cp terraform.tfvars.example terraform.tfvars   # điền project_id, admin_cidrs, alert_email
terraform init -backend-config="bucket=$P-tfstate"
terraform plan -out=tfplan
terraform apply tfplan
terraform output
```

Kết quả mong đợi: có `external_ip` và `pgbackrest_bucket`. Có thể xoá network `default` của
project để không còn rule SSH mở cho 0.0.0.0/0.

## 4. P2 · Cài VM và chạy thử (EC2 vẫn phục vụ bình thường)

```bash
export P=... ZONE=asia-southeast1-a
gcloud compute ssh qltt-prod --project "$P" --zone "$ZONE" --tunnel-through-iap   # lần đầu tạo key

# Trên VM
curl -fsSL https://raw.githubusercontent.com/bi6-cat/QLTrungTam/dev/deploy/gcp/bootstrap-vm.sh | sudo bash
# Exporter password mới, mạnh (bản trên EC2 chỉ dài 4 ký tự). Role được tạo khi init volume mới.
openssl rand -hex 24 | sudo -u ubuntu tee /opt/QLTrungTam/secrets/postgres_exporter_password.txt >/dev/null
```

Copy `.env` từ EC2 sang VM bằng stream (không lưu trên máy quản trị, không in ra màn hình):

```bash
ssh -i ~/Documents/keypem/ec2-linh.pem ubuntu@95.41.14.32 'cat /opt/QLTrungTam/.env' \
  | gcloud compute ssh qltt-prod --project "$P" --zone "$ZONE" --tunnel-through-iap \
      --command 'sudo -u ubuntu tee /opt/QLTrungTam/.env >/dev/null'
```

```bash
# Trên VM
sudo bash /opt/QLTrungTam/deploy/gcp/setup-app.sh <pgbackrest_bucket>
sudo -iu ubuntu bash -c 'cd /opt/QLTrungTam && FORCE_DEPLOY=1 bash scripts/deploy-ec2.sh dev'
```

Kết quả mong đợi: `stanza-create`/`check` thành công, timer `qltrungtam-pgbackrest-*` active,
deploy in `Deploy thành công`. Từ máy quản trị chạy diễn tập (chạy lại bao nhiêu lần cũng được):

```bash
GCP_PROJECT=$P bash deploy/gcp/cutover.sh rehearse
```

Muốn xem UI thì mở tunnel `-L 3001:127.0.0.1:3001` như script gợi ý. Cookie đăng nhập có thể đòi
HTTPS, nên dựa vào health và số dòng là chính.

## 5. P3 · Cutover (khoảng 15–20 phút, chọn giờ trung tâm ít thao tác)

Hôm trước:
- Cloudflare: hạ TTL `aplus` xuống 1 phút (bản ghi đang ở chế độ DNS only).
- Cloudflare: tạo `rustdesk.zett.io.vn` A → IP GCP (DNS only).
- Báo nhân sự trung tâm về khung giờ bảo trì.

Trong cửa sổ bảo trì:

```bash
GCP_PROJECT=$P bash deploy/gcp/cutover.sh final         # dừng App EC2, dump, restore, so số dòng
# Cloudflare: A aplus → <external_ip>
GCP_PROJECT=$P NEW_IP=<external_ip> bash deploy/gcp/cutover.sh post   # Caddy + HTTPS + full backup
GCP_PROJECT=$P RUSTDESK_HOST=rustdesk.zett.io.vn bash deploy/gcp/cutover.sh rustdesk
```

Sau đó:
- [ ] Smoke test: đăng nhập, dashboard, lớp/học sinh, hoá đơn, trang `/pay` và `/teacher`.
- [ ] SePay: đối soát giao dịch phát sinh trong cửa sổ (webhook lúc App dừng sẽ fail). Domain không
      đổi nên không phải sửa webhook URL.
- [ ] RustDesk client: đổi ID server sang `rustdesk.zett.io.vn`; key giữ nguyên.
- [ ] Nhận được email cảnh báo thử hoặc thấy uptime check xanh trong Cloud Monitoring.

**Rollback** (khi chưa có ai ghi dữ liệu trên GCP): `cutover.sh rollback`, rồi trả A record về
`95.41.14.32`. Nếu đã có ghi dữ liệu trên GCP: dump GCP, restore ngược về EC2 bằng
`restore-db-ec2.sh` rồi mới đổi DNS.

## 6. P4 · Sau cutover

- Lưu bản dump cutover lên GCS: trên VM chạy
  `gcloud storage cp /opt/QLTrungTam/backups/cutover-*.dump gs://<bucket>/archive/`.
- Restore drill từ GCS trong container cô lập, theo [runbook backup](POSTGRES-BACKUP-RESTORE.md).
- Cập nhật [OPERATIONS.md](../OPERATIONS.md): host, port matrix, monitoring mới.

## 7. P5 · Dọn tài khoản AWS cũ (sau ≥ 7 ngày ổn định, trước khi tài khoản hết hạn)

Terminate EC2, xoá EBS volume/snapshot, release Elastic IP (nếu có), xoá bucket
`qltrungtam-pg-backrest-906266477814-ap-east-1-an`, IAM role/instance profile
`qltrungtam-pgbackrest-ec2`, security group. Cuối cùng xem Billing để chắc chắn về $0.

## 8. Quay về AWS mới (trước 2026-12-24)

Làm cùng mô hình theo chiều ngược lại: dựng EC2 + bucket S3 + IAM Role, sửa bucket/region trong
`deploy/app/postgres/pgbackrest.conf`, bỏ `EXPORTER_BIND_IP`/`PGBACKREST_CONF` khỏi `.env`, rồi
dump → restore → so số dòng → đổi DNS. Vì RustDesk client đã trỏ hostname nên chỉ cần đổi DNS.
Bắt đầu chuẩn bị khoảng 2026-12-01.

## 9. Việc phát hiện thêm (độc lập với việc chuyển nhà)

- Prod đang không có cảnh báo nào (monitoring VM đã mất). Uptime check ở P1 thay thế tạm thời.
- `secrets/postgres_exporter_password.txt` và `grafana_admin_password.txt` chỉ dài 4 ký tự.
- `.env` trên EC2 đang mode `664` (docs yêu cầu `0600`); `setup-app.sh` đặt `0600` trên VM mới.
- `ufw` tắt trên EC2; GCP chỉ dựa vào VPC firewall (80/443, RustDesk, SSH từ IP admin + IAP).
- Key RustDesk `id_ed25519` đang mode `644`; script `rustdesk` đặt `600` khi chuyển.
