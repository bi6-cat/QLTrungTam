# Lab GCP — Terraform · Kubernetes · CI/CD

Tài liệu tổng quan của lab. Hướng dẫn chi tiết từng bước được đưa trong chat; file này giữ
các quyết định, thông số chung và checklist để mọi buổi làm thống nhất với nhau.

Mục tiêu: có kinh nghiệm thật để đi phỏng vấn vị trí **Kubernetes / Cloud Platform Engineer**
(xem bảng đối chiếu JD ở mục 7). Trọng tâm là **tự dựng và vận hành Kubernetes bằng kubeadm**
(control plane, etcd, networking, storage, ingress, HA, DR). GKE dùng để so sánh với managed service.
Kịch bản xuyên suốt: đưa app QLTrungTam từ **VM chạy docker-compose** (giống prod hiện tại)
lên **cluster kubeadm HA**, rồi lên **GKE + Cloud SQL**, sau đó dựng GitOps, giám sát và luyện xử lý sự cố.

## 1. Đã chốt

| Mục | Giá trị |
| --- | --- |
| GCP | Free Trial $300, kích hoạt **2026-09-25**, hết hạn khoảng **2026-12-24**. Không nâng lên tài khoản trả phí |
| Budget | $150, cảnh báo qua email ở 50% / 90% / 100% |
| Project | 1 project: `PROJECT_ID = project-070733c0-e22c-4fbf-a55` (tên "QLTT K8S"). Biến shell nằm trong `.env.gcp` ở gốc repo (đã gitignore) |
| Region / zone | `asia-southeast1` (Singapore) / `asia-southeast1-a` |
| Domain | Chỉ dùng `gcp.zett.io.vn`, được trỏ NS từ Cloudflare sang Cloud DNS |
| Máy chạy lệnh | Ghi kiến trúc thật ở M0 (`uname -m`). Nếu là arm64 thì image phải build cho `linux/amd64` |
| IaC | Terraform (hạ tầng) + Ansible (cấu hình OS, cài kubeadm) |
| CI đăng nhập GCP | **Workload Identity Federation** cho GitHub Actions, không dùng JSON key |
| Git | Nhánh trunk `gcp-lab` (tách từ `dev`). Mỗi mảng làm trên 1 nhánh `gcp/mXX-<tên>`, xong thì mở PR vào `gcp-lab` |

## 2. Quy tắc

- **Free Trial giới hạn số vCPU chạy cùng lúc** (đọc con số thật ở M0.5). Không chạy cluster kubeadm,
  GKE và VM legacy cùng lúc; xong mảng nào thì stop/destroy mảng đó.
- Cuối buổi:
  - mảng kubeadm (M3–M4): `gcloud compute instances stop` các node, giữ disk để buổi sau làm tiếp;
  - các mảng khác: `terraform destroy`. Chỉ giữ lại các thứ ở mục 3.
- **Trước khi destroy GKE**, xoá các namespace có Ingress / Gateway / Service LoadBalancer / PVC.
  Nếu không xoá, GCP sẽ để lại Load Balancer và disk nằm ngoài Terraform, vẫn tính tiền.
- Không commit: JSON key, `*.tfstate`, `terraform.tfvars` chứa mật khẩu, kubeconfig, `.env`, etcd snapshot.
- `zett.io.vn` là domain prod (`aplus.`, `monitor.`). Trên Cloudflare chỉ thêm bản ghi NS cho
  `gcp`, không động vào bản ghi nào khác.
- Không dùng data hay secret của prod. Data giả lấy từ `prisma/seed.ts`.
- SSH chỉ mở cho IP của mình.
- Code app phải sửa cho lab (metrics, fault flag) thì chỉ để trên nhánh `gcp-lab`, không merge vào `dev`.
- Khi kể chuyện phỏng vấn, việc nào làm trong lab thì nói rõ là **[LAB]**. Câu chuyện production thật
  là app QLTrungTam đang chạy trên EC2 kèm monitoring.

## 3. Những thứ giữ lâu dài (tạo tay, không nằm trong Terraform)

| Thứ | Tên | Vì sao tạo tay |
| --- | --- | --- |
| Bucket state | `PROJECT_ID-tfstate` (bật versioning) | State không thể do chính nó quản lý |
| Cloud DNS zone | `gcp-zett` → `gcp.zett.io.vn.` | Xoá rồi tạo lại thì NS bị đổi, lại phải sửa Cloudflare |
| Artifact Registry | `qltt` (docker, `asia-southeast1`) | Giữ image qua các lần destroy |
| Bucket backup | `PROJECT_ID-backup` | etcd snapshot, Velero backup phải sống sót sau khi destroy cluster |
| Budget | Billing → Budgets & alerts | Nằm ở cấp billing account, không thuộc project |

Workload Identity Pool cho GitHub và service account `github-ci` tạo bằng Terraform ở M6
(không có key nên dựng lại không ảnh hưởng gì).

## 4. Thông số chung

| Mục | Giá trị |
| --- | --- |
| VPC | `qltt-vpc` (custom mode) |
| Subnet | `public` 10.10.0.0/24 · `private` 10.10.1.0/24 · `k8s` 10.10.2.0/24 · `gke` 10.10.16.0/20 |
| Dải phụ của GKE | `pods` 10.100.0.0/16 · `services` 10.101.0.0/20 |
| Dải cho Cloud SQL (private service access) | 10.50.0.0/20 |
| VM legacy (M9, tùy chọn) | `legacy-app`, `legacy-db`: e2-small, Debian 12 |
| kubeadm (M3) | Ubuntu 24.04. Phương án A: `cp1-3` e2-medium (on-demand) + `w1-2` e2-standard-2 (spot). Phương án B nếu quota chỉ 8 vCPU: `cp1-3` + `w1`, bỏ taint control plane để app có replica thứ hai |
| kubeadm network | Pod CIDR `192.168.0.0/16` (Calico **VXLAN**), Service CIDR `10.96.0.0/12`, node bật `can_ip_forward` |
| API endpoint (M3) | Internal passthrough Network LB TCP 6443 → `cp1-3`, DNS nội bộ `k8s-api.lab.internal` |
| Ingress kubeadm (M3) | Traefik DaemonSet NodePort ← External passthrough Network LB, hostname `k8s.gcp.zett.io.vn` |
| GKE (M5) | Standard, zonal `asia-southeast1-a`, release channel `REGULAR`, pool spot e2-standard-2: 2 node, tăng lên 3 node từ M6 |
| Cloud SQL (M5) | PostgreSQL 16, `edition = ENTERPRISE`, `db-g1-small`, private IP, bật backup + PITR |
| Hostname | `app.` (app trên GKE) · `k8s.` (app trên kubeadm) · `argocd.` · `grafana.` (tất cả dưới `gcp.zett.io.vn`) |
| Namespace | `qltt`, `argocd`, `monitoring`, `external-secrets`, `external-dns`, `velero` |
| Label | `project=qltt`, `env=lab`, `component=<network|vm|k8s|gke|db|...>` |

**Khác biệt cloud so với lab on-prem (`k8s-lab`):** VPC của GCP không cho ARP/VRRP tự do, nên
Keepalived VIP và MetalLB L2 không dùng được. Thay bằng Internal LB cho API server và NodePort + LB
cho ingress. Calico IP-in-IP (protocol 4) cũng bị VPC chặn, nên dùng VXLAN.

Phiên bản tool và chart: ghi vào đây khi dùng tới.

| Thành phần | Phiên bản |
| --- | --- |
| Terraform | 1.16.4 |
| Provider `hashicorp/google` | |
| Kubernetes (kubeadm) · Calico · Traefik | |
| GKE | |
| argo-cd · argo-rollouts | |
| kube-prometheus-stack · loki · alloy | |
| external-secrets · external-dns · velero | |

## 5. Bộ tool

| Nhóm | Tool |
| --- | --- |
| Hạ tầng | Terraform (module, import, plan trong CI), `tflint` |
| Cấu hình VM | Ansible |
| Container | Docker (multi-stage), containerd, `crictl`, Artifact Registry |
| Kubernetes | kubeadm, `etcdctl`, GKE, `kubectl`, Helm, k9s |
| CI/CD | GitHub Actions, Trivy, Argo CD; Jenkins (tùy chọn) |
| Add-on k8s | Workload Identity, External Secrets + Secret Manager, external-dns, Velero |
| Giám sát | Cloud Monitoring, kube-prometheus-stack (Prometheus, Grafana, Alertmanager → Discord), Loki + Alloy |
| Triển khai nâng cao | Argo Rollouts (canary + analysis) |
| Test tải | k6 |
| Scripting | Python (`kubernetes` client) |

**Cert:** GKE dùng Certificate Manager, xác thực qua DNS, gắn vào Gateway ở M5. Cluster kubeadm
chạy HTTP ở M3; nếu còn thời gian thì thêm cert-manager + Let's Encrypt (DNS-01 qua Cloud DNS).
Không dùng ingress-nginx vì dự án này đã ngừng phát triển từ 2026.

## 6. Lộ trình

Mỗi mục con là 1 commit hoặc 1 checkbox. "PV" là câu hỏi phỏng vấn hay gặp mà mảng đó giúp trả lời.
"CKA" đánh dấu phần trùng với đề thi CKA, nên luyện bấm giờ song song.

### M0 · Chuẩn bị (1–2h)
- [x] 0.1 Chốt sổ OCI: commit code Day 2 làm archive, tắt Mutagen, tạo nhánh `gcp-lab` từ `dev`
- [x] 0.2 Cài tool: gcloud, terraform, kubectl, helm, k9s, ansible, Docker đã có; `tflint` cài ở M1, `k6` ở M5, `gh` ở M6
- [x] 0.3 `gcloud init`, tạo project, gắn billing, đặt region mặc định (môi trường lab tách riêng bằng `.env.gcp`)
- [x] 0.4 Budget $150 + cảnh báo
- [x] 0.5 Đọc quota thật: `CPUS_ALL_REGIONS=12`, `CPUS`=32, `INSTANCES`=8, `IN_USE_ADDRESSES`=4 → chốt **phương án A**
- [x] 0.6 Bật API, tạo bucket state, bucket backup, DNS zone, Artifact Registry
- [x] 0.7 Thêm NS cho `gcp` trên Cloudflare
- Xong khi: `dig NS gcp.zett.io.vn +short` trả về name server của Google

### M1 · Terraform cơ bản (3–4h)
- [x] 1.1 `init` / `plan` / `apply` / `destroy` với 1 bucket
- [x] 1.2 Biến, output, `terraform.tfvars`
- [x] 1.3 Chuyển state lên GCS (backend `gcs`, có khoá state)
- [x] 1.4 Tạo tay 1 firewall trên Console rồi `terraform import`
- [x] 1.5 Tách `modules/network` ngay từ đầu, thêm `terraform fmt -check` + `tflint`
- Xong khi: `plan` báo "No changes"; state nằm trong bucket
- PV: State để ở đâu, khoá thế nào? Có người sửa tay trên Console (drift) thì xử lý ra sao?

### M2 · Mạng đầy đủ + Artifact Registry (2h)
Bỏ phần VM "hệ thống cũ": câu chuyện migration ở M5 đi từ PostgreSQL trên cluster kubeadm sang Cloud SQL.
Ansible học luôn ở M3 (role `k8s-common`). VM legacy chuyển sang M9 (mục 9.6).
- [x] 2.1 Firewall: web (80/443, tag `web`), nội bộ `10.10.0.0/16`; SSH qua IAP
- [x] 2.2 Cloud Router + Cloud NAT cho subnet `private` và `k8s`
- [x] 2.3 Build image app (`app/Dockerfile`) rồi push lên Artifact Registry `qltt`
- Xong khi: `terraform plan` sạch; `gcloud artifacts docker images list` thấy image của app
- PV: Subnet private ra internet bằng cách nào? Firewall theo network tag khác theo CIDR chỗ nào?

### M3 · kubeadm HA tự dựng (8–10h) — trọng tâm
- [ ] 3.1 Terraform `modules/k8s-nodes`: node theo phương án A/B, firewall nội bộ (6443, 2379-2380, 10250,
      10257, 10259, UDP 4789 VXLAN, 30000-32767), firewall health check từ `35.191.0.0/16` và `130.211.0.0/22`
- [ ] 3.2 Internal LB TCP 6443 cho API server + bản ghi DNS nội bộ `k8s-api.lab.internal`
- [ ] 3.3 Ansible role `k8s-common`: tắt swap, kernel module, sysctl, containerd (`SystemdCgroup=true`), kubeadm/kubelet/kubectl
- [ ] 3.4 `kubeadm init` trên cp1 với `--control-plane-endpoint k8s-api.lab.internal:6443 --upload-certs`
- [ ] 3.5 Calico (VXLAN), rồi join cp2, cp3 và worker. Ghi lại cách xử lý khi node backend của Internal LB
      gọi chính VIP đó (lúc join, `/etc/hosts` tạm trỏ `k8s-api` về cp1)
- [ ] 3.6 local-path-provisioner, metrics-server, Traefik NodePort + External LB, bản ghi `k8s.gcp.zett.io.vn`
- [ ] 3.7 Deploy app: PostgreSQL bằng CloudNativePG (StatefulSet + PVC), Job migrate, Deployment 2 replica,
      Ingress — tái dùng manifest từ `deploy/k8s-lab/manifests` trên nhánh `k8s-lab`
- Xong khi: `kubectl get nodes` đủ node `Ready`; `curl http://k8s.gcp.zett.io.vn/api/health` trả về `ok`;
  có thể vẽ lại sơ đồ control plane (apiserver, etcd, scheduler, controller-manager, kubelet) từ trí nhớ
- PV: Một request `kubectl apply` đi qua những thành phần nào? Vì sao cần 3 control plane? Pod CIDR, Service CIDR khác gì nhau? (CKA)

### M4 · Vận hành cluster tự dựng (6h)
- [ ] 4.1 etcd: `etcdctl member list`, `endpoint health`, snapshot đẩy lên bucket backup, restore thử
- [ ] 4.2 Drill: stop 1 control plane (cluster vẫn chạy), stop 2 control plane (mất quorum), khôi phục
- [ ] 4.3 Drill: stop worker chứa PostgreSQL primary, xem CNPG promote replica; app tự hồi phục
- [ ] 4.4 `kubectl drain` / `cordon` / `uncordon` một node để bảo trì
- [ ] 4.5 `kubeadm upgrade` lên minor tiếp theo (control plane trước, worker sau), app không downtime nhờ PDB
- [ ] 4.6 `kubeadm certs check-expiration` và `kubeadm certs renew`
- [ ] 4.7 Bài lỗi node: kubelet chết, containerd chết, đầy disk (`df`, `du`, `journalctl -u kubelet`, `crictl`)
- [ ] 4.8 Sổ tay so sánh "tự dựng vs managed": phần nào GKE làm giúp, phần nào vẫn là việc của mình
- Xong khi: mỗi drill có ghi chú "triệu chứng → lệnh kiểm tra → cách sửa" trong `docs/labs/gcp/incidents/`.
  Stop toàn bộ node trước khi sang M5
- PV: Backup etcd thế nào, restore khi nào? Upgrade cluster không downtime ra sao? Node `NotReady` thì kiểm tra gì? (CKA)

### M5 · GKE + Cloud SQL + chuyển DB (6h)
- [ ] 5.1 GKE bằng Terraform (`modules/gke`), lấy credential bằng `gcloud container clusters get-credentials`
- [ ] 5.2 Cloud SQL private IP (`modules/cloudsql`), bật backup + PITR
- [ ] 5.3 Tự viết Helm chart `charts/qltrungtam`: Deployment, Service, Gateway/HTTPRoute, Secret, Job migration;
      liveness/readiness probe, requests/limits, PDB
- [ ] 5.4 Cert từ Certificate Manager gắn vào Gateway, bản ghi `app.gcp.zett.io.vn`
- [ ] 5.5 Chuyển data: `pg_dump` từ PostgreSQL trên cluster kubeadm → restore vào Cloud SQL → `npm run audit:data`
- [ ] 5.6 Cutover có **đo downtime**, kế hoạch rollback viết sẵn; HPA + bắn tải bằng k6
- Xong khi: app chạy trên GKE + Cloud SQL; có số đo downtime và kế hoạch rollback
- PV: Kể một lần migration: làm những bước nào, downtime bao lâu, nếu hỏng thì rollback ra sao? Khi nào chọn managed, khi nào tự dựng?

### M6 · CI/CD + GitOps (6–7h)
- [ ] 6.1 Workload Identity Federation cho GitHub + SA `github-ci` (Terraform)
- [ ] 6.2 Workflow Terraform: mỗi PR tự chạy `plan` và comment vào PR
- [ ] 6.3 Workflow app: test → build → Trivy scan → push Artifact Registry
- [ ] 6.4 Argo CD (Helm), UI ở `argocd.gcp.zett.io.vn`; Application trỏ vào `gitops/`, bật auto-sync
- [ ] 6.5 CI cập nhật image tag trong git, Argo tự deploy; rollback bằng `git revert`
- [ ] 6.6 External Secrets kéo mật khẩu DB từ Secret Manager; external-dns tự tạo bản ghi; add-on cài bằng app-of-apps
- Xong khi: merge PR thì app lên version mới mà không chạy `kubectl` bằng tay; trong git không còn secret
- PV: Deploy kiểu push khác kiểu pull (GitOps) chỗ nào? Secret để ở đâu? CI đăng nhập cloud mà không cần key bằng cách nào?

### M7 · Observability + sự cố + DR (8h)
- [ ] 7.1 kube-prometheus-stack qua Argo CD, `grafana.gcp.zett.io.vn`
- [ ] 7.2 App expose `/metrics` (prom-client) + log JSON có cấu trúc (Claude viết code mẫu trong `app/`); ServiceMonitor; dashboard request / lỗi / độ trễ theo route
- [ ] 7.3 Alertmanager → Discord, có `for` và grouping để không spam
- [ ] 7.4 Loki + Alloy thu log, tìm log lỗi trong Grafana
- [ ] 7.5 Bài lỗi K8s: CrashLoopBackOff, OOMKilled, ImagePullBackOff, Pending, Service không có endpoint, DNS trong cluster lỗi
- [ ] 7.6 Bài lỗi DB: sai mật khẩu, hết connection; restore Cloud SQL bằng PITR
- [ ] 7.7 Velero backup namespace `qltt` lên bucket backup, xoá namespace rồi restore; ghi RTO/RPO đo được
- [ ] 7.8 Viết 1–2 **postmortem** đầy đủ: timeline, tác động, root cause (5 whys), hành động phòng ngừa
- Xong khi: tắt DB thì Discord nhận alert; có postmortem và số đo RTO/RPO
- PV: Bạn theo dõi những chỉ số nào? Kể một sự cố và cách tìm root cause. Kế hoạch DR của bạn ra sao?

### M8 · Bảo mật cơ bản (3h)
- [ ] 8.1 RBAC: tạo user chỉ được xem namespace `qltt`
- [ ] 8.2 NetworkPolicy: chỉ app mới gọi được DB
- [ ] 8.3 Pod Security Admission mức `restricted`; container non-root, filesystem chỉ đọc
- [ ] 8.4 Trivy chặn build nếu có CVE mức Critical
- PV: Phân quyền trong k8s thế nào? Làm sao chặn pod gọi lung tung sang nhau? (CKS)

### M9 · Tùy chọn (làm nếu còn thời gian và credit)
- [ ] 9.1 Argo Rollouts canary 10% → 50% → 100%, AnalysisTemplate query Prometheus, fault flag để thấy tự abort
- [ ] 9.2 Jenkins (cài bằng Ansible trên 1 VM) chạy cùng pipeline build của app
- [ ] 9.3 Script Python dùng `kubernetes` client: báo cáo pod lỗi, node gần đầy, cert sắp hết hạn
- [ ] 9.4 EKS 1 buổi bằng Terraform (tài khoản AWS riêng), deploy chart, destroy ngay
- [ ] 9.5 k3s 1 node làm cluster thứ hai, Argo CD quản lý cả hai (multi-cluster)
- [ ] 9.7 Thêm dịch vụ có sẵn (`podinfo`, hoặc Online Boutique + Redis từ Helm cộng đồng) để thử nhiều dịch vụ gọi nhau, NetworkPolicy, tracing
- [ ] 9.6 Dựng lại hệ thống "cũ" trên 2 VM (`legacy-app`, `legacy-db`, Ansible), rồi migrate sang kubeadm/GKE

### M10 · Chi phí + dựng lại + hồ sơ phỏng vấn (3–4h)
- [ ] 10.1 Billing report: tiền tốn vào đâu, so sánh VM / kubeadm / GKE
- [ ] 10.2 Destroy hết rồi dựng lại từ đầu, bấm giờ
- [ ] 10.3 4–5 câu chuyện STAR, bảng đối chiếu GCP ↔ AWS ↔ Azure, dòng mô tả cho CV
- Xong khi: có con số chi phí thật và thời gian dựng lại thật

## 7. Đối chiếu với JD

| Yêu cầu trong JD | Làm ở |
| --- | --- |
| kubeadm / RKE2 / K3s, control plane, worker, etcd | M3, M4 (k3s ở 9.5) |
| Networking, Ingress, Load Balancer, Storage | M3 (Calico, Traefik, LB, CNPG + PVC), M5 (Gateway) |
| Docker, containerd, Helm, manifest YAML | M2, M3, M5 |
| Monitoring, logging, alerting | M7 |
| CI/CD, ArgoCD, GitOps, Jenkins | M6, 9.2 |
| Phân tích nguyên nhân gốc, xử lý sự cố | M4, M7 (postmortem) |
| HA, multi-cluster, Disaster Recovery | M3, M4, M7.7, 9.5 |
| Cloud, managed Kubernetes, Terraform | M1, M5, 9.4 |
| CKA / CKAD / CKS | M3–M4 (CKA), M5 (CKAD), M8 (CKS) |
| Python / Golang | 9.3 |
| Tài liệu kỹ thuật, tiêu chuẩn vận hành | `journal.md`, `incidents/`, postmortem |

## 8. Cấu trúc repo dự kiến

```text
infra/                  # Terraform
  modules/{network,vm,k8s-nodes,gke,cloudsql,ci}/  
  lab/                  # root: gọi các module, backend GCS
ansible/                # M2: Docker + app trên VM · M3: role k8s-common, kubeadm
deploy/gcp-lab/         # M2: docker-compose cho VM (bản rút gọn của deploy/app)
k8s/kubeadm/            # M3: manifest app + add-on cho cluster tự dựng
charts/qltrungtam/      # M5: Helm chart của app
gitops/                 # M6+: Argo CD Application + values của các add-on
tests/load/             # k6
scripts/lab/            # 9.3: script Python
docs/labs/gcp/          # README này, journal.md, incidents/, postmortems/
.github/workflows/      # M6: terraform-plan.yml · app-ci.yml
```

## 9. Nhịp mỗi buổi

Đầu buổi:
1. `source .env.gcp`, rồi `gcloud config list` để chắc chắn đang đúng project.
2. Vào Billing → Reports xem chi phí hôm qua.
3. `terraform apply` (mảng kubeadm: `gcloud compute instances start` các node).

Cuối buổi:
1. Ghi kết quả vào `journal.md`, commit.
2. Mảng kubeadm: stop các node. Mảng GKE: xoá các namespace có LB/PVC (xem mục 2), rồi `terraform destroy`.
3. Kiểm tra không còn sót gì đang tính tiền:

```bash
gcloud compute instances list; gcloud compute disks list
gcloud compute forwarding-rules list; gcloud compute addresses list
gcloud container clusters list; gcloud sql instances list
```

## 10. Chi phí ước tính

| Giai đoạn | Chạy gì | Khoảng |
| --- | --- | --- |
| Luôn bật | Bucket, DNS zone, Artifact Registry | ~$1–3/tháng |
| M2 | 2 VM e2-small + NAT | ~$3–5 |
| M3–M4 | 4–5 VM (control plane on-demand, worker spot) + 2 LB + disk khi stop | ~$20–35 |
| M5 | GKE 2 node spot + Cloud SQL nhỏ + LB | ~$15–25 |
| M6–M8 | GKE 3 node spot + Cloud SQL + add-on | ~$35–55 |
| M9 | Tùy chọn | ~$5–15 |

Tổng khoảng $80–135 nếu stop/destroy đúng nhịp. Budget $150 là mốc tự quản, phần credit còn lại để dự phòng.
