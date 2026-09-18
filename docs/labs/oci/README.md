# Hướng dẫn chi tiết lab OCI/OKE 10 ngày

Bộ tài liệu này là phần "làm thế nào" cho bản đề xuất
[`OCI-OKE-10-DAY-LAB.md`](../OCI-OKE-10-DAY-LAB.md). Bản đề xuất trả lời *làm gì và vì sao*;
mỗi file ở đây liệt kê từng bước, lệnh, code mẫu, cách kiểm tra và lỗi hay gặp.

| Ngày | File | Nội dung chính |
| --- | --- | --- |
| 0 | [DAY-00-chuan-bi.md](DAY-00-chuan-bi.md) | Công cụ, tài khoản, limit, compartment, key, bucket state |
| 1 | [DAY-01-iac-foundation.md](DAY-01-iac-foundation.md) | OpenTofu: foundation + network + storage + IAM + CI |
| 2 | [DAY-02-oke-clusters.md](DAY-02-oke-clusters.md) | OKE prod (Enhanced) + staging (Basic, A1), node pool, autoscaler |
| 3 | [DAY-03-gitops-platform.md](DAY-03-gitops-platform.md) | Argo CD, ESO, Envoy Gateway, cert-manager, external-dns, CNPG, Rollouts |
| 4 | [DAY-04-app-delivery.md](DAY-04-app-delivery.md) | Helm chart, CNPG prod, migration hook, pipeline build → promote |
| 5 | [DAY-05-app-features.md](DAY-05-app-features.md) | F3 Valkey rate limit, F4 seed/simulator, F5 đối soát, F6 fault flag |
| 6 | [DAY-06-observability.md](DAY-06-observability.md) | F1/F2 OTel, Prometheus, Loki, Tempo, Alertmanager, meta-monitor |
| 7 | [DAY-07-slo-load-test.md](DAY-07-slo-load-test.md) | Pyrra SLO, k6-operator, capacity report |
| 8 | [DAY-08-progressive-delivery-upgrade.md](DAY-08-progressive-delivery-upgrade.md) | Canary có analysis, upgrade OKE, CNPG switchover |
| 9 | [DAY-09-game-day-dr.md](DAY-09-game-day-dr.md) | G1–G7, PITR, postmortem |
| 10 | [DAY-10-rebuild-teardown.md](DAY-10-rebuild-teardown.md) | Rebuild bấm giờ, export, teardown sạch |

> **Thứ tự F1–F6 trong code khác bản đề xuất.** F1 (metrics) và F2 (tracing) cùng dùng
> OpenTelemetry SDK nên được gộp vào Day 6, lúc đã có Prometheus/Tempo để kiểm tra. Day 5 làm
> F3, F4, F5, F6. Lý do chi tiết ở mục "Quyết định" bên dưới.

---

## 1. Quyết định đã chốt cho bộ hướng dẫn

Bản đề xuất §10 còn 4 câu hỏi mở. Bộ hướng dẫn dùng phương án đề xuất; nếu bạn chọn khác, xem
cột "Nếu chọn khác".

| Câu hỏi | Mặc định trong hướng dẫn | Nếu chọn khác |
| --- | --- | --- |
| OpenTofu hay Terraform | **OpenTofu ≥ 1.10** (dùng state encryption) | Terraform ≥ 1.12: đổi `tofu` → `terraform`, bỏ khối `encryption`, dùng `backend "oci"` |
| Repo public/private | Chạy được cả hai | Private: Day 3 thêm deploy key cho Argo CD, Day 4 build arm64 bằng QEMU |
| `gitops/` tách repo | **Cùng repo** | Tách repo: đổi `repoURL` trong mọi Application |
| Branch | **`oci-lab` là trunk của lab**. Argo CD theo dõi `oci-lab`, PR của lab merge vào `oci-lab` | Không merge `oci-lab` vào `main`/`dev` trong 10 ngày |

### Chỗ bộ hướng dẫn khác bản đề xuất (và lý do)

| # | Bản đề xuất | Hướng dẫn làm | Lý do |
| --- | --- | --- | --- |
| D1 | 1 stack Tofu `envs/lab` | **2 stack**: `envs/foundation` (giữ lâu) và `envs/lab` (dựng/xoá nhiều lần) | Vault và tag namespace của OCI xoá bất đồng bộ (chờ 7–30 ngày), không tạo lại cùng tên ngay được. Bucket backup DB phải sống lâu hơn cluster thì Day 10 mới restore được. |
| D2 | Bucket `tfstate` do module `storage` tạo | Tạo bằng OCI CLI ở Day 0 | Bucket chứa state không thể do chính state đó quản lý. |
| D3 | Tofu cài Argo CD bằng `helm_release` | Script `infra/oci/scripts/bootstrap-argocd.sh` | Provider `helm`/`kubernetes` phụ thuộc output của cluster trong cùng stack gây lỗi khi destroy/rebuild; GitHub runner cũng không vào được API endpoint đã allowlist IP. Tofu chỉ quản lý tài nguyên OCI. |
| D4 | Sync wave: cert-manager → external-dns → Envoy → ESO | **ESO → Envoy Gateway → cert-manager/external-dns** → CNPG → Rollouts | Token Cloudflare lấy từ OCI Vault qua ESO. Gateway API CRD do chart Envoy Gateway cài, cert-manager cần CRD đó khi khởi động. |
| D5 | Migration là PreSync hook trong cùng app với DB | DB là Argo Application riêng `qltrungtam-db`, sync trước app | PreSync chạy trước mọi resource của app; nếu Cluster CNPG nằm cùng app thì lần cài đầu migration chạy khi DB chưa tồn tại. |
| D6 | F1 dùng `prom-client` tại `/api/metrics` | OTel SDK nạp bằng `node --require`, metrics ở cổng `:9464` | Canary analysis cần HTTP metrics theo pod cho **mọi** route, kể cả trang `/pay/[short_code]` (server component không bọc được bằng wrapper). Cổng riêng thì không cần chặn `/api/metrics` ở Gateway. |
| D7 | Root `Dockerfile` | `deploy/oci-lab/Dockerfile` riêng | Production (`deploy/app/docker-compose.yml`) build từ root `Dockerfile`. Lab không được làm đổi image production. |
| D8 | CNPG PVC 20 Gi | **50 Gi** | Block Volume OCI tối thiểu 50 GB. |
| D9 | "Simulator ký payload" | Simulator gửi secret qua header `Authorization: Apikey …` | Route `src/app/api/webhook/sepay/route.ts` so sánh shared secret, không kiểm HMAC. |
| D10 | F3 chỉ chuyển bucket sang Valkey | F3 thêm: lấy IP client từ hop tin cậy cuối của `X-Forwarded-For`, và giới hạn webhook sai secret theo IP | `getClientIp()` trong `src/lib/actions.ts` lấy phần tử **đầu** của XFF, client tự gửi header là né được limit. G6 cần webhook có rate limit. |
| D11 | NetworkPolicy trong chart | Vẫn viết, nhưng **Day 4 phải kiểm tra có được enforce không** | OKE VCN-native pod networking có thể không enforce NetworkPolicy. Nếu không, ghi rõ là giới hạn đã biết và dựa vào NSG. |

---

## 2. Máy làm lab

Máy của bạn là Windows. Toàn bộ lệnh trong hướng dẫn viết cho **bash trên WSL2 Ubuntu 24.04**.
Không chạy trong PowerShell hoặc Git Bash (khác cú pháp `base64`, `sed`, đường dẫn key).

OCI Cloud Shell có sẵn `oci`, `kubectl`, `helm` nhưng không có `tofu` và mất file sau khi
đóng phiên lâu; chỉ dùng nó làm phương án dự phòng.

## 3. Biến môi trường dùng chung

Tạo file `~/.qltt-lab.env` trong WSL (không nằm trong repo, `chmod 600`). Mọi file hướng dẫn giả
định bạn đã `source ~/.qltt-lab.env` trước khi chạy lệnh.

```bash
# ~/.qltt-lab.env
export LAB_REPO=~/src/QLTrungTam            # clone repo trong filesystem WSL, không để ở /mnt/f
export LAB_BRANCH=oci-lab
export GITHUB_REPO=bi6-cat/QLTrungTam

export OCI_CLI_PROFILE=DEFAULT
export OCI_REGION=ap-kulai-2
export OCI_HOME_REGION=ap-kulai-2           # Day 0 xác nhận lại, có thể khác region lab
export TENANCY_OCID=ocid1.tenancy.oc1..xxxx
export COMPARTMENT_OCID=ocid1.compartment.oc1..xxxx   # qltt-lab, tạo ở Day 0
export OS_NAMESPACE=xxxxxxxx                # oci os ns get
export OCIR_HOST=${OCI_REGION}.ocir.io
export S3_ENDPOINT=https://${OS_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oraclecloud.com

export LAB_DOMAIN=lab.example.com           # subdomain Cloudflare dành cho lab
export ADMIN_CIDR=$(curl -s https://ifconfig.me)/32

export CREDIT_EXPIRES_AT="2026-09-27T23:59:00+07:00"   # Day 0 điền giá trị thật

# Chỉ dùng cho backend S3-compat của Tofu (Customer Secret Key của user bạn)
export AWS_ACCESS_KEY_ID=xxxx
export AWS_SECRET_ACCESS_KEY=xxxx
# Passphrase mã hoá state OpenTofu (>= 16 ký tự). Mất passphrase = mất state.
export TF_VAR_state_passphrase='xxxxxxxxxxxxxxxxxxxxxxxx'
```

> `ADMIN_CIDR` đổi khi IP nhà bạn đổi. Nếu `kubectl` đột nhiên timeout, chạy lại
> `source ~/.qltt-lab.env` rồi `tofu apply` stack `lab` để cập nhật NSG.

## 4. Hostname

| Hostname | Cluster | Dùng cho |
| --- | --- | --- |
| `qltt.${LAB_DOMAIN}` | prod | Ứng dụng |
| `qltt-stg.${LAB_DOMAIN}` | staging | Ứng dụng staging |
| `argocd.${LAB_DOMAIN}` | prod | Argo CD UI (allowlist IP) |
| `grafana.${LAB_DOMAIN}` | prod | Grafana (allowlist IP) |
| `rollouts.${LAB_DOMAIN}` | prod | Argo Rollouts dashboard (Day 8, allowlist IP) |

Mỗi cluster có một Gateway với chứng chỉ wildcard `*.${LAB_DOMAIN}` (DNS-01), nên không đụng
giới hạn số cert của Let's Encrypt khi rebuild nhiều lần.

## 5. Phiên bản

Không chép số phiên bản từ trí nhớ hay blog cũ. **Sáng Day 0**, tra và ghi vào bảng này, sau đó
mọi `targetRevision`/`version` trong repo dùng đúng giá trị đã ghi. Trong hướng dẫn, chỗ cần
điền được viết dạng `<ARGOCD_CHART_VERSION>`.

```bash
helm repo add argo https://argoproj.github.io/argo-helm
helm repo add jetstack https://charts.jetstack.io
helm repo add external-dns https://kubernetes-sigs.github.io/external-dns/
helm repo add external-secrets https://charts.external-secrets.io
helm repo add cnpg https://cloudnative-pg.github.io/charts
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo add chaos-mesh https://charts.chaos-mesh.org
helm repo update
for c in argo/argo-cd argo/argocd-apps argo/argo-rollouts jetstack/cert-manager \
         external-dns/external-dns external-secrets/external-secrets \
         cnpg/cloudnative-pg cnpg/plugin-barman-cloud \
         prometheus-community/kube-prometheus-stack prometheus-community/prometheus-pushgateway \
         grafana/loki grafana/tempo grafana/alloy grafana/k6-operator chaos-mesh/chaos-mesh; do
  helm search repo "$c" --output json | jq -r '.[0] | "\(.name)\t\(.version)\t\(.app_version)"'
done
helm show chart oci://docker.io/envoyproxy/gateway-helm | grep -E '^(version|appVersion)'
oci ce cluster-options get --cluster-option-id all --region "$OCI_REGION" \
  --query 'data."kubernetes-versions"' --output table
```

> Nếu một chart của Grafana không còn trong repo `grafana` (Grafana đã chuyển một số chart
> sang repo community), tìm tên repo mới trên trang GitHub của chart đó và cập nhật bảng.

| Thành phần | Biến | Phiên bản ghi ngày 17/09 |
| --- | --- | --- |
| OpenTofu | — | |
| Provider `oracle/oci` | `OCI_PROVIDER_VERSION` | |
| Kubernetes (prod lúc tạo = mới nhất − 1 minor) | `K8S_VERSION_START` | |
| Kubernetes (đích upgrade Day 8) | `K8S_VERSION_TARGET` | |
| argo-cd chart | `ARGOCD_CHART_VERSION` | |
| argocd-apps chart | `ARGOCD_APPS_CHART_VERSION` | |
| argo-rollouts chart | `ROLLOUTS_CHART_VERSION` | |
| Rollouts Gateway API plugin | `ROLLOUTS_GATEWAY_PLUGIN_VERSION` | |
| external-secrets chart | `ESO_CHART_VERSION` | |
| gateway-helm (Envoy Gateway) | `ENVOY_GATEWAY_VERSION` | |
| cert-manager chart | `CERT_MANAGER_VERSION` | |
| external-dns chart | `EXTERNAL_DNS_CHART_VERSION` | |
| cloudnative-pg chart | `CNPG_CHART_VERSION` | |
| plugin-barman-cloud chart | `BARMAN_PLUGIN_CHART_VERSION` | |
| kube-prometheus-stack | `KPS_CHART_VERSION` | |
| prometheus-pushgateway | `PUSHGATEWAY_CHART_VERSION` | |
| loki / tempo / alloy | `LOKI_CHART_VERSION` / `TEMPO_CHART_VERSION` / `ALLOY_CHART_VERSION` | |
| Pyrra (manifest release) | `PYRRA_VERSION` | |
| k6-operator chart | `K6_OPERATOR_CHART_VERSION` | |
| chaos-mesh chart | `CHAOS_MESH_CHART_VERSION` | |
| PostgreSQL image | — | `ghcr.io/cloudnative-pg/postgresql:16-minimal-trixie` (giữ như lab cũ) |

## 6. Cấu trúc repo sau 10 ngày

```text
deploy/oci-lab/
  Dockerfile                  # image app cho lab (D7), có OTel preload
  otel/                       # package.json + register.cjs + fault.cjs (F1, F2, F6)
infra/oci/
  modules/{network,oke-cluster,node-pool,storage,iam,vault,budget,meta-monitor}/
  envs/foundation/            # tag, vault, secrets, OCIR, bucket backup, budget
  envs/lab/                   # VCN, NSG, OKE, node pools, bucket loki/tempo, IAM workload
  scripts/{bootstrap-argocd.sh,pre-destroy.sh,verify-empty.sh}
gitops/
  bootstrap/root-app.yaml
  clusters/{prod,staging}/    # Application/ApplicationSet theo cluster
  platform/<addon>/values*.yaml và manifests phụ
  apps/qltrungtam/chart/
  envs/{staging,prod}/values.yaml
scripts/lab/                  # seed-scale.ts, export-load-fixtures.ts, reset-load-state.ts
tests/load/                   # k6 scripts, fixtures
docs/labs/oci/                # hướng dẫn này + capacity report, postmortem, cost report
.github/workflows/{infra.yml,app-lab.yml}
```

## 7. Nhịp mỗi ngày

**Mở đầu ngày (10 phút)**

```bash
source ~/.qltt-lab.env
# Còn bao nhiêu giờ trước deadline credit?
echo $(( ( $(date -d "$CREDIT_EXPIRES_AT" +%s) - $(date +%s) ) / 3600 )) giờ
# Chi phí hôm qua (Cost Analysis có độ trễ vài giờ)
oci usage-api usage-summary request-summarized-usages \
  --tenant-id "$TENANCY_OCID" --granularity DAILY \
  --time-usage-started "$(date -u -d 'yesterday' +%Y-%m-%dT00:00:00Z)" \
  --time-usage-ended "$(date -u +%Y-%m-%dT00:00:00Z)" \
  --query 'data.items[].{service:service,cost:"computed-amount"}' --output table
kubectl config get-contexts
```

**Kết thúc ngày (20 phút)**

1. Kiểm tra DoD của ngày, ghi kết quả (số đo, ảnh chụp) vào `docs/labs/oci/journal.md`.
2. Commit theo từng phần, push `oci-lab`.
3. Ghi lại việc dở dang và chi phí ước tính của ngày.
4. Nếu dừng lab qua đêm mà chưa cần dữ liệu chạy liên tục: scale pool `app` và `obs` về 0 **không**
   được khuyến nghị sau Day 6 (mất liên tục metrics). Trước Day 6 thì có thể.

## 8. Quy tắc an toàn (áp dụng mọi ngày)

- Không dùng dữ liệu, secret, domain hay Discord channel của production.
- Không commit: `~/.oci/*`, kubeconfig, `*.tfvars` có giá trị thật, `.tfstate`, dump DB, fixtures có
  secret. Thêm vào `.gitignore` ở Day 1.
- Không bấm **Upgrade to Pay As You Go** trong 10 ngày.
- Mọi tài nguyên tạo tay trên Console phải được ghi vào `journal.md` để teardown không bỏ sót.
- Mọi lệnh phá huỷ (`tofu destroy`, xoá namespace, terminate node) chỉ chạy khi `kubectl config
  current-context` và `tofu workspace show`/thư mục hiện tại đúng như mong đợi.
