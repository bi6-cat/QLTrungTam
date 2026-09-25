# Lab GCP — Terraform · Kubernetes · CI/CD

Tài liệu tổng quan của lab. Hướng dẫn chi tiết từng bước được đưa trong chat; file này giữ
các quyết định, thông số chung và checklist để mọi buổi làm thống nhất với nhau.

Mục tiêu: có kinh nghiệm thật với Terraform, Kubernetes, CI/CD và vận hành cloud để đi phỏng vấn
(Cloud/DevOps Engineer). Kịch bản xuyên suốt: đưa app QLTrungTam từ **VM chạy docker-compose**
(giống prod hiện tại) sang **GKE + Cloud SQL**, rồi dựng GitOps, giám sát, canary và luyện xử lý sự cố.

## 1. Đã chốt

| Mục | Giá trị |
| --- | --- |
| GCP | Free Trial $300, kích hoạt **2026-09-25**, hết hạn khoảng **2026-12-24**. Không nâng lên tài khoản trả phí |
| Budget | $150, cảnh báo qua email ở 50% / 90% / 100% |
| Project | 1 project: `PROJECT_ID = __________` (điền ở M0) |
| Region / zone | `asia-southeast1` (Singapore) / `asia-southeast1-a` |
| Domain | Chỉ dùng `gcp.zett.io.vn`, được trỏ NS từ Cloudflare sang Cloud DNS |
| Máy chạy lệnh | Mac (Apple Silicon, arm64), nên image phải build cho `linux/amd64` |
| IaC | Terraform |
| CI đăng nhập GCP | JSON key của service account, lưu trong GitHub secret |
| Git | Nhánh trunk `gcp-lab` (tách từ `dev`). Mỗi mảng làm trên 1 nhánh `gcp/mXX-<tên>`, xong thì mở PR vào `gcp-lab` |

## 2. Quy tắc

- **Cuối mỗi buổi chạy `terraform destroy`.** Chỉ giữ lại các thứ ở mục 3.
- **Trước khi destroy GKE**, xoá các namespace có Ingress / Gateway / Service LoadBalancer / PVC.
  Nếu không xoá, GCP sẽ để lại Load Balancer và disk nằm ngoài Terraform, vẫn tính tiền.
- Không commit: JSON key, `*.tfstate`, `terraform.tfvars` chứa mật khẩu, kubeconfig, `.env`.
- `zett.io.vn` là domain prod (`aplus.`, `monitor.`). Trên Cloudflare chỉ thêm bản ghi NS cho
  `gcp`, không động vào bản ghi nào khác.
- Không dùng data hay secret của prod. Data giả lấy từ `prisma/seed.ts`.
- SSH chỉ mở cho IP của mình.
- Code app phải sửa cho lab (metrics, fault flag) thì chỉ để trên nhánh `gcp-lab`, không merge vào `dev`.
- Khi kể chuyện phỏng vấn, việc nào làm trong lab thì nói rõ là **[LAB]**.

## 3. Những thứ giữ lâu dài (tạo tay, không nằm trong Terraform)

| Thứ | Tên | Vì sao tạo tay |
| --- | --- | --- |
| Bucket state | `PROJECT_ID-tfstate` (bật versioning) | State không thể do chính nó quản lý |
| Cloud DNS zone | `gcp-zett` → `gcp.zett.io.vn.` | Xoá rồi tạo lại thì NS bị đổi, lại phải sửa Cloudflare |
| Artifact Registry | `qltt` (docker, `asia-southeast1`) | Giữ image qua các lần destroy |
| Service account CI | `github-ci` + JSON key (tạo ở M4) | Key không bị đổi mỗi lần dựng lại |
| Budget | Billing → Budgets & alerts | Nằm ở cấp billing account, không thuộc project |

## 4. Thông số chung

| Mục | Giá trị |
| --- | --- |
| VPC | `qltt-vpc` (custom mode) |
| Subnet | `public` 10.10.0.0/24 · `private` 10.10.1.0/24 · `gke` 10.10.16.0/20 |
| Dải phụ của GKE | `pods` 10.100.0.0/16 · `services` 10.101.0.0/20 |
| Dải cho Cloud SQL (private service access) | 10.50.0.0/20 |
| VM (M2) | `legacy-app`, `legacy-db`: e2-small, Debian 12 |
| MIG (M3) | e2-small, 2–4 máy |
| GKE (M5+) | Standard, zonal `asia-southeast1-a`, release channel `REGULAR`, pool spot e2-standard-2: 2 node ở M5, tăng lên 3–4 node từ M8 |
| Cloud SQL (M6) | PostgreSQL 16, `edition = ENTERPRISE`, `db-g1-small`, private IP, bật backup + PITR |
| Hostname | `app.` (app: chạy trên MIG, M6 cutover sang GKE) · `demo.` (nginx ở M5) · `argocd.` · `grafana.` (tất cả dưới `gcp.zett.io.vn`) |
| Namespace | `qltt`, `argocd`, `monitoring`, `external-secrets`, `external-dns`, `argo-rollouts` |
| Label | `project=qltt`, `env=lab`, `component=<network|vm|gke|db|...>` |

Phiên bản tool và chart: ghi vào đây khi dùng tới.

| Thành phần | Phiên bản |
| --- | --- |
| Terraform / provider `hashicorp/google` | |
| GKE | |
| argo-cd · argo-rollouts | |
| kube-prometheus-stack · loki · alloy | |
| external-secrets · external-dns | |

## 5. Bộ tool

| Nhóm | Tool |
| --- | --- |
| Hạ tầng | Terraform (module, import, plan trong CI), `tflint` |
| Cấu hình VM | Ansible |
| Container | Docker (multi-stage), Artifact Registry |
| Kubernetes | GKE, `kubectl`, Helm, k9s |
| CI/CD | GitHub Actions, Trivy, Argo CD |
| Add-on k8s | Workload Identity, External Secrets + Secret Manager, external-dns |
| Giám sát | Cloud Monitoring, kube-prometheus-stack (Prometheus, Grafana, Alertmanager → Discord), Loki + Alloy |
| Triển khai nâng cao | Argo Rollouts (canary + analysis) |
| Test tải | k6 |

**Cert của `app.gcp.zett.io.vn`:** tạo 1 lần bằng Certificate Manager, xác thực qua DNS. M3 gắn
cert này vào Load Balancer của MIG. M6 gắn đúng cert đó vào Gateway của GKE, nên lúc cutover
cert đã sẵn ở cả hai bên và không bị lỗi HTTPS.
M5 học Ingress có sẵn của GKE. Từ M6 chuyển sang **Gateway API** (cũng có sẵn trong GKE),
vì Gateway API là hướng thay thế Ingress. Không dùng ingress-nginx vì dự án này đã ngừng phát triển từ 2026.

## 6. Lộ trình

Mỗi mục con là 1 commit hoặc 1 checkbox. "PV" là câu hỏi phỏng vấn hay gặp mà mảng đó giúp trả lời.

### M0 · Chuẩn bị (1–2h)
- [ ] 0.1 Chốt sổ OCI: commit code Day 2 làm archive, tắt Mutagen, tạo nhánh `gcp-lab` từ `dev`
- [ ] 0.2 Cài tool trên Mac: gcloud, terraform, kubectl, helm, k9s, ansible, k6, gh, tflint, OrbStack (Docker)
- [ ] 0.3 `gcloud init`, tạo project, gắn billing, đặt region mặc định
- [ ] 0.4 Budget $150 + cảnh báo
- [ ] 0.5 Đọc quota thật (CPU, IP, disk) và ghi vào journal
- [ ] 0.6 Bật API, tạo bucket state, DNS zone, Artifact Registry
- [ ] 0.7 Thêm NS cho `gcp` trên Cloudflare
- Xong khi: `dig NS gcp.zett.io.vn +short` trả về name server của Google

### M1 · Terraform cơ bản (3–4h)
- [ ] 1.1 `init` / `plan` / `apply` / `destroy` với 1 bucket
- [ ] 1.2 Biến, output, `terraform.tfvars`
- [ ] 1.3 Chuyển state lên GCS (backend `gcs`, có khoá state)
- [ ] 1.4 Tạo tay 1 firewall trên Console rồi `terraform import`
- Xong khi: `plan` báo "No changes"; state nằm trong bucket
- PV: State để ở đâu, khoá thế nào? Có người sửa tay trên Console (drift) thì xử lý ra sao?

### M2 · Mạng + VM "hệ thống cũ" + Ansible (5–6h)
- [ ] 2.1 VPC, subnet public/private, firewall (80/443 mở cho mọi nơi, 22 chỉ cho IP của mình)
- [ ] 2.2 Cloud Router + Cloud NAT cho subnet private
- [ ] 2.3 `legacy-app` (subnet public) + `legacy-db` (subnet private, không có IP public)
- [ ] 2.4 Build image app (`linux/amd64`) rồi push lên Artifact Registry
- [ ] 2.5 Ansible: cài Docker, deploy Postgres lên `legacy-db` và app lên `legacy-app`, chạy seed
- [ ] 2.6 Snapshot disk DB, rồi khôi phục ra disk mới
- Xong khi: mở được app qua IP của `legacy-app`; `legacy-db` không có IP public nhưng vẫn `apt update` được
- PV: Subnet private ra internet bằng cách nào? Terraform khác Ansible chỗ nào?

### M3 · Load balancer + autoscaling + Cloud Monitoring (4h)
- [ ] 3.1 Instance template + MIG (health check, autohealing, autoscale theo CPU)
- [ ] 3.2 HTTPS Load Balancer + cert từ Certificate Manager (xác thực qua DNS) + bản ghi `app.gcp.zett.io.vn`
- [ ] 3.3 Bắn tải bằng k6, xem MIG scale out
- [ ] 3.4 Uptime check + alert gửi email
- Xong khi: xoá 1 VM thì nó tự dựng lại; bắn tải thì số VM tăng; tắt app thì nhận được email
- PV: Health check dùng để làm gì? Autoscale dựa trên cái gì?

### M4 · Terraform module + CI plan (3h)
- [ ] 4.1 Tách code thành `modules/network`, `modules/vm`, `modules/mig`
- [ ] 4.2 Thêm `tflint` và `terraform fmt -check`
- [ ] 4.3 Tạo SA `github-ci` + JSON key, lưu vào GitHub secret
- [ ] 4.4 Workflow: mỗi PR tự chạy `plan` và comment vào PR
- Xong khi: PR có comment plan
- PV: Khi có nhiều môi trường thì tổ chức code Terraform thế nào? Làm sao để CI chạy Terraform an toàn?

### M5 · Kubernetes cơ bản (6h)
- [ ] 5.1 Tạo GKE bằng Terraform (`modules/gke`), lấy credential bằng `gcloud container clusters get-credentials`
- [ ] 5.2 Chạy nginx: Pod → Deployment → Service → Ingress (`demo.gcp.zett.io.vn`)
- [ ] 5.3 Namespace, ConfigMap, Secret
- [ ] 5.4 Liveness/readiness probe, requests/limits
- [ ] 5.5 Rolling update + `kubectl rollout undo`; xem cluster bằng k9s
- Xong khi: `https://demo.gcp.zett.io.vn` trả về trang nginx; xoá pod thì pod tự lên lại
- PV: Liveness khác readiness chỗ nào? Pod bị Pending hoặc CrashLoop thì kiểm tra ở đâu?

### M6 · App lên GKE + Cloud SQL + chuyển DB (6–7h)
- [ ] 6.1 Đọc Dockerfile multi-stage (vì sao image nhỏ, vì sao chạy non-root)
- [ ] 6.2 Cloud SQL private IP (`modules/cloudsql`), bật backup + PITR
- [ ] 6.3 Tự viết Helm chart `charts/qltrungtam`: Deployment, Service, Gateway/HTTPRoute (gắn cert từ M3), Secret, Job migration (`prisma migrate deploy`)
- [ ] 6.4 Chuyển data: `pg_dump` từ `legacy-db` → restore vào Cloud SQL → kiểm tra bằng `npm run audit:data`
- [ ] 6.5 Cutover: dừng ghi → dump/restore lần cuối → trỏ `app.` sang Gateway của GKE, **đo downtime**. Rollback là trỏ ngược về LB của MIG
- [ ] 6.6 HPA + bắn tải bằng k6; tắt các VM cũ
- Xong khi: app chạy trên GKE + Cloud SQL; có số đo downtime và kế hoạch rollback đã viết ra
- PV: Kể một lần migration: làm những bước nào, downtime bao lâu, nếu hỏng thì rollback ra sao?

### M7 · CI/CD + GitOps (6h)
- [ ] 7.1 Workflow app: test → build → Trivy scan → push Artifact Registry
- [ ] 7.2 Cài Argo CD (Helm), mở UI ở `argocd.gcp.zett.io.vn`
- [ ] 7.3 Tạo Argo Application trỏ vào chart trong `gitops/`, bật auto-sync
- [ ] 7.4 CI cập nhật image tag trong git, Argo tự deploy; rollback bằng `git revert`
- Xong khi: merge PR thì app lên version mới mà không phải chạy `kubectl` bằng tay
- PV: Deploy kiểu push khác kiểu pull (GitOps) chỗ nào? Rollback thế nào?

### M8 · Add-on cho cluster (4–5h)
- [ ] 8.1 Workload Identity: cho pod gọi GCP API mà không cần key
- [ ] 8.2 External Secrets: kéo mật khẩu DB từ Secret Manager xuống thành Secret trong k8s
- [ ] 8.3 external-dns: tự tạo bản ghi trong zone `gcp.zett.io.vn`
- [ ] 8.4 Chuyển toàn bộ add-on sang cài bằng Argo CD (app-of-apps)
- Xong khi: trong git không còn secret nào; thêm route mới là DNS tự có bản ghi
- PV: Làm GitOps thì secret để ở đâu? Pod lấy quyền gọi cloud bằng cách nào?

### M9 · Prometheus + Grafana + Loki (6h)
- [ ] 9.1 Cài kube-prometheus-stack qua Argo CD, mở `grafana.gcp.zett.io.vn`
- [ ] 9.2 App expose `/metrics` (prom-client) + ServiceMonitor
- [ ] 9.3 Dashboard request / lỗi / độ trễ theo route
- [ ] 9.4 Alertmanager bắn cảnh báo về Discord
- [ ] 9.5 Loki + Alloy thu log, xem log ngay trong Grafana
- Xong khi: tắt DB thì Discord nhận được alert; tìm được log lỗi trong Grafana
- PV: Bạn theo dõi những chỉ số nào? Làm sao để alert không bị spam?

### M10 · Canary tự rollback (4–5h)
- [ ] 10.1 Cài Argo Rollouts, đổi Deployment của app thành Rollout (canary 10% → 50% → 100%)
- [ ] 10.2 AnalysisTemplate query Prometheus để đo tỉ lệ lỗi
- [ ] 10.3 Thêm fault flag (biến môi trường làm app trả về lỗi 5xx), deploy bản lỗi để thấy nó tự abort
- Xong khi: bản lỗi tự quay về bản cũ, không cần người can thiệp
- PV: Rolling, blue/green và canary khác nhau thế nào? Canary quyết định rollback dựa vào đâu?

### M11 · Vận hành & xử lý sự cố (6h)
- [ ] 11.1 Linux: đầy disk, service chết (`df`, `du`, `systemctl`, `journalctl`)
- [ ] 11.2 K8s: CrashLoopBackOff, OOMKilled, ImagePullBackOff, Pending, Service không có endpoint
- [ ] 11.3 DB: sai mật khẩu, hết connection
- [ ] 11.4 Upgrade GKE (control plane + node pool) có PodDisruptionBudget, app không bị downtime
- [ ] 11.5 Restore Cloud SQL bằng PITR về một thời điểm cụ thể
- Xong khi: mỗi lỗi có 1 ghi chú "triệu chứng → lệnh kiểm tra → cách sửa" trong `docs/labs/gcp/incidents/`
- PV: Kể một sự cố bạn đã xử lý. Nâng cấp cluster thế nào để không bị downtime?

### M12 · Bảo mật cơ bản (2–3h)
- [ ] 12.1 RBAC: tạo user chỉ được xem namespace `qltt`
- [ ] 12.2 NetworkPolicy: chỉ app mới gọi được DB và các dịch vụ nội bộ
- [ ] 12.3 Container chạy non-root, filesystem chỉ đọc; Trivy chặn build nếu có CVE mức Critical
- PV: Phân quyền trong k8s thế nào? Làm sao chặn pod gọi lung tung sang nhau?

### M13 · Chi phí + dựng lại + hồ sơ phỏng vấn (3–4h)
- [ ] 13.1 Billing report: tiền tốn vào đâu, so sánh chạy trên VM với chạy trên GKE
- [ ] 13.2 Destroy hết rồi dựng lại từ đầu, bấm giờ
- [ ] 13.3 4–5 câu chuyện kể theo STAR, bảng đối chiếu GCP ↔ AWS, dòng mô tả cho CV
- Xong khi: có con số chi phí thật và thời gian dựng lại thật

## 7. Cấu trúc repo dự kiến

```text
infra/gcp/              # Terraform: M1–M3 để phẳng, từ M4 tách ra modules/
  modules/{network,vm,mig,gke,cloudsql}/
ansible/                # M2: playbook cài Docker + deploy lên VM
deploy/gcp-lab/         # M2: docker-compose cho VM (bản rút gọn của deploy/app)
charts/qltrungtam/      # M6: Helm chart của app
gitops/                 # M7+: Argo CD Application + values của các add-on
tests/load/             # k6
docs/labs/gcp/          # README này, journal.md, incidents/
.github/workflows/      # M4: terraform-plan.yml · M7: app-ci.yml
```

## 8. Nhịp mỗi buổi

Đầu buổi:
1. `source ~/.qltt-gcp.env`, rồi `gcloud config list` để chắc chắn đang đúng project.
2. Vào Billing → Reports xem chi phí hôm qua.
3. `terraform apply`.

Cuối buổi:
1. Ghi kết quả vào `journal.md`, commit.
2. Xoá các namespace có LB/PVC (xem mục 2), rồi `terraform destroy`.
3. Kiểm tra không còn sót gì:

```bash
gcloud compute instances list; gcloud compute disks list
gcloud compute forwarding-rules list; gcloud compute addresses list
gcloud container clusters list; gcloud sql instances list
```

## 9. Chi phí ước tính

| Giai đoạn | Chạy gì | Khoảng |
| --- | --- | --- |
| Luôn bật | Bucket, DNS zone, Artifact Registry | ~$1–3/tháng |
| M2–M4 | 2–4 VM e2-small + LB + NAT | ~$10–15 |
| M5–M6 | GKE 2 node spot + Cloud SQL nhỏ + LB | ~$15–25 |
| M7–M13 | GKE 3–4 node spot + Cloud SQL + add-on | ~$50–80 |

Tổng khoảng $80–120 nếu destroy sau mỗi buổi. Budget $150 là mốc tự quản, phần credit còn lại để dự phòng.
