# Day 0 · Chuẩn bị tài khoản và công cụ

> Thời lượng: ~1,5 giờ (thêm 30 phút nếu chưa có WSL2) · Chi phí: $0
> Đầu vào: tài khoản OCI Free Trial đã kích hoạt, domain trên Cloudflare, quyền admin repo GitHub.

## Kết quả cuối ngày

- [ ] Biết chính xác **ngày giờ credit hết hạn**, đã ghi vào `~/.qltt-lab.env` và `journal.md`.
- [ ] Có bảng limit thật của tenancy, đã quyết định sizing chuẩn hay phương án B.
- [ ] Biết A1 ở Kulai còn capacity hay không.
- [ ] Compartment `qltt-lab`, API key, Customer Secret Key, bucket `qltt-tfstate` đã có.
- [ ] Budget alert tạm đã bật.
- [ ] Cloudflare token scope 1 zone đã test.
- [ ] Branch `oci-lab`, Discord webhook lab đã có.
- [ ] Mọi công cụ trong §1 chạy được trong WSL.

---

## 1. Cài công cụ trong WSL2

Nếu chưa có WSL2: mở PowerShell (Admin) chạy `wsl --install -d Ubuntu-24.04`, khởi động lại máy.

Clone repo vào filesystem của WSL (I/O qua `/mnt/f` rất chậm và lỗi quyền file key):

```bash
mkdir -p ~/src && cd ~/src
git clone https://github.com/bi6-cat/QLTrungTam.git && cd QLTrungTam
git switch k8s-lab
```

Cài công cụ:

```bash
sudo apt-get update
sudo apt-get install -y curl unzip jq git gnupg ca-certificates python3-venv pipx

# OCI CLI
pipx install oci-cli && pipx ensurepath && exec bash
oci --version

# OpenTofu (script cài chính thức, dạng deb)
curl -fsSL https://get.opentofu.org/install-opentofu.sh -o /tmp/install-opentofu.sh
chmod +x /tmp/install-opentofu.sh && sudo /tmp/install-opentofu.sh --install-method deb
tofu version

# kubectl (khớp minor với K8S_VERSION_START, lệch ±1 minor là chấp nhận được)
K=$(curl -Ls https://dl.k8s.io/release/stable.txt)
curl -Lo /tmp/kubectl "https://dl.k8s.io/release/${K}/bin/linux/amd64/kubectl"
sudo install -m 0755 /tmp/kubectl /usr/local/bin/kubectl

# Helm
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# yq (mikefarah), argocd CLI, kubectl-argo-rollouts, cnpg plugin
sudo curl -Lo /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
sudo curl -Lo /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo curl -Lo /usr/local/bin/kubectl-argo-rollouts https://github.com/argoproj/argo-rollouts/releases/latest/download/kubectl-argo-rollouts-linux-amd64
sudo chmod +x /usr/local/bin/{yq,argocd,kubectl-argo-rollouts}
curl -sSfL https://github.com/cloudnative-pg/cloudnative-pg/raw/main/hack/install-cnpg-plugin.sh | sudo sh -s -- -b /usr/local/bin

# tflint, trivy, GitHub CLI
curl -s https://raw.githubusercontent.com/terraform-linters/tflint/master/install_linux.sh | bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin
sudo apt-get install -y gh

# Kiểm tra
for t in oci tofu kubectl helm yq argocd kubectl-argo-rollouts kubectl-cnpg tflint trivy gh; do
  printf '%-24s' "$t"; command -v "$t" >/dev/null && echo OK || echo THIẾU
done
```

> Các lệnh `latest` ở trên chỉ dùng cho CLI trên máy bạn. Phiên bản chạy trong cluster phải pin
> theo bảng ở [README §5](README.md#5-phiên-bản). Điền bảng đó ngay hôm nay.

---

## 2. Cấu hình OCI CLI và API signing key

Tofu và OCI CLI dùng chung key này.

```bash
oci setup config
```

Trả lời:

| Câu hỏi | Giá trị |
| --- | --- |
| Location for config | `~/.oci/config` (mặc định) |
| User OCID | Console → góc phải → **My profile** → copy OCID |
| Tenancy OCID | Console → **Tenancy details** → OCID |
| Region | `ap-kulai-2` |
| Generate a new API signing RSA key pair? | `Y`, không đặt passphrase (hoặc đặt và dùng `OCI_CLI_PASSPHRASE`) |

Sau đó upload public key:

1. **My profile → Tokens and keys → API keys → Add API key → Paste a public key**.
2. Dán nội dung `~/.oci/oci_api_key_public.pem`.
3. So sánh fingerprint trên Console với dòng `fingerprint` trong `~/.oci/config`.

```bash
chmod 600 ~/.oci/config ~/.oci/oci_api_key.pem
oci iam region-subscription list --output table     # thấy cột is-home-region
oci os ns get                                        # ra Object Storage namespace
```

Điền `TENANCY_OCID`, `OS_NAMESPACE`, `OCI_HOME_REGION` vào `~/.qltt-lab.env`.

> **Home region quan trọng.** Compartment, policy, dynamic group, tag namespace chỉ tạo được ở home
> region. Nếu home region không phải `ap-kulai-2`, Tofu sẽ dùng provider alias `home` (Day 1).

---

## 3. Ngày giờ hết hạn credit

Console → **Billing & Cost Management → Subscriptions** (hoặc trang **Upgrade and Manage
Payment**). Ghi lại:

- Thời điểm Free Trial kết thúc, chuyển sang giờ Việt Nam.
- Số credit còn lại.

```bash
# ví dụ
sed -i 's|^export CREDIT_EXPIRES_AT=.*|export CREDIT_EXPIRES_AT="2026-09-27T23:59:00+07:00"|' ~/.qltt-lab.env
source ~/.qltt-lab.env
echo "Teardown phải xong trước: $(date -d "$CREDIT_EXPIRES_AT - 12 hours" '+%F %H:%M')"
```

Nếu còn **ít hơn 10 ngày tính từ sáng mai**: áp dụng dòng "Credit hết hạn sớm" ở bản đề xuất §9
(gộp Day 8 vào Day 9).

---

## 4. Kiểm tra service limit

Tên limit thay đổi theo thời gian, nên liệt kê rồi lọc thay vì đoán tên.

```bash
T=$TENANCY_OCID
AD=$(oci iam availability-domain list --query 'data[0].name' --raw-output)
echo "AD=$AD"

# 4.1 Compute: E5, A1, E2 micro
oci limits value list --compartment-id "$T" --service-name compute --all \
  --query "data[?contains(name,'e5') || contains(name,'a1') || contains(name,'micro')].{name:name,scope:\"scope-type\",ad:\"availability-domain\",value:value}" \
  --output table

# 4.2 Dùng thực tế / còn trống của 1 limit (ví dụ E5 core)
oci limits resource-availability get --compartment-id "$T" --service-name compute \
  --limit-name standard-e5-core-count --availability-domain "$AD"

# 4.3 OKE, NLB, Block Volume, Vault
for s in container-engine network-load-balancer-api block-storage kms; do
  echo "== $s"
  oci limits value list --compartment-id "$T" --service-name "$s" --all \
    --query 'data[].{name:name,value:value}' --output table 2>/dev/null || echo "(không có service tên $s, xem oci limits service list)"
done
oci limits service list --compartment-id "$T" --all --query 'data[].name' | grep -iE 'container|load|block|kms|vault'
```

Điền bảng vào `docs/labs/oci/journal.md`:

| Limit | Cần cho lab | Thực tế | Ghi chú |
| --- | --- | --- | --- |
| E5 cores (OCPU) | 12 thường xuyên, 16 lúc Day 7–8 | | `system` 4 + `app` 6→10 + `obs` 2 + `loadgen` 4 |
| E5 memory (GB) | 128 → 192 | | |
| A1 cores / memory | 4 / 24 | | staging |
| OKE cluster | 2 (3 nếu làm S2) | | |
| NLB | 3 (prod public, staging public, prod internal) | | |
| Block Volume tổng (GB) | ~1.200 (boot 50 GB × 10 node + PVC) | | |
| Vault / key | 1 / 1 | | |

**Quyết định sizing:**

- E5 cores ≥ 16 → sizing chuẩn.
- 8 ≤ E5 cores < 16 → phương án B (node 1 OCPU, gộp `obs` vào `system`, không có `loadgen`).
- E5 cores < 8 → xin tăng limit (**Governance → Limits → Request a service limit increase**) ngay tối
  nay; trong lúc chờ, lab vẫn làm được Day 1.

---

## 5. Kiểm tra capacity A1 mà không tạo tài nguyên

Compute Capacity Report trả lời "còn host cho shape này không" mà không tạo instance:

```bash
oci compute compute-capacity-report create \
  --compartment-id "$TENANCY_OCID" \
  --availability-domain "$AD" \
  --shape-availabilities '[{"instanceShape":"VM.Standard.A1.Flex","instanceShapeConfig":{"ocpus":2,"memoryInGbs":12}},
                           {"instanceShape":"VM.Standard.E5.Flex","instanceShapeConfig":{"ocpus":2,"memoryInGbs":16}}]' \
  --query 'data."shape-availabilities"[].{shape:"instance-shape",status:"availability-status",count:"available-count"}' \
  --output table
```

- `AVAILABLE` → ổn.
- `OUT_OF_HOST_CAPACITY` cho A1 → staging dùng E5 1 OCPU/8 GB × 2, build image chỉ amd64 (§9 bản
  đề xuất). Ghi vào journal.

Nếu lệnh trên không có trong bản CLI của bạn, dùng cách của bản đề xuất: Console tạo instance A1
2 OCPU/12 GB (dùng VCN wizard), chờ `RUNNING`, rồi **terminate kèm boot volume** và xoá VCN wizard
đã tạo.

---

## 6. Compartment, Customer Secret Key, bucket state

```bash
# 6.1 Compartment (tạo ở home region; CLI tự điều hướng)
oci iam compartment create --compartment-id "$TENANCY_OCID" \
  --name qltt-lab --description "QLTrungTam OCI lab 10 ngay" \
  --query 'data.id' --raw-output
# chờ ~1 phút cho compartment ACTIVE, điền COMPARTMENT_OCID vào ~/.qltt-lab.env
source ~/.qltt-lab.env
oci iam compartment get --compartment-id "$COMPARTMENT_OCID" --query 'data."lifecycle-state"'
```

**Customer Secret Key** (credential kiểu S3 cho backend Tofu):

```bash
USER_OCID=$(awk -F= '/^user/{print $2}' ~/.oci/config)
oci iam customer-secret-key create --user-id "$USER_OCID" --display-name tofu-state \
  --query 'data.{id:id,key:key}' --output json
```

- `id` là **access key ID**, `key` là **secret**, secret chỉ hiện một lần.
- Điền vào `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` trong `~/.qltt-lab.env`.
- Mỗi user tối đa 2 Customer Secret Key. Key thứ hai dành cho user dịch vụ ở Day 1, **không** tạo
  thêm key trên user của bạn.

**Bucket state** (D2: tạo bằng CLI, không do Tofu quản lý):

```bash
oci os bucket create --compartment-id "$COMPARTMENT_OCID" --name qltt-tfstate \
  --public-access-type NoPublicAccess --versioning Enabled \
  --freeform-tags '{"project":"qltt-lab"}'

# Test S3-compat endpoint bằng credential vừa tạo
source ~/.qltt-lab.env
python3 -m venv /tmp/s3t && /tmp/s3t/bin/pip -q install boto3
/tmp/s3t/bin/python - <<'PY'
import boto3, os
s3 = boto3.client("s3", endpoint_url=os.environ["S3_ENDPOINT"], region_name=os.environ["OCI_REGION"])
s3.put_object(Bucket="qltt-tfstate", Key="probe.txt", Body=b"ok")
print(s3.get_object(Bucket="qltt-tfstate", Key="probe.txt")["Body"].read())
s3.delete_object(Bucket="qltt-tfstate", Key="probe.txt")
PY
```

Nếu `put_object` báo lỗi checksum/`XAmzContentSHA256Mismatch`: đặt thêm
`export AWS_REQUEST_CHECKSUM_CALCULATION=when_required` và
`export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required` vào `~/.qltt-lab.env`. SDK S3 bản mới gửi
header checksum mà endpoint S3-compat có thể chưa hỗ trợ. Lỗi này sẽ gặp lại ở CNPG, Loki, Tempo.

---

## 7. Budget tạm

Budget đặt ở **root compartment** để bắt cả tài nguyên lỡ tạo ngoài `qltt-lab`. Day 1 sẽ tạo lại bằng
Tofu và xoá bản tay này.

```bash
EMAIL=you@example.com
BUDGET_ID=$(oci budgets budget create --compartment-id "$TENANCY_OCID" \
  --amount 360 --reset-period MONTHLY --target-type COMPARTMENT \
  --targets "[\"$TENANCY_OCID\"]" --display-name qltt-lab-manual \
  --query 'data.id' --raw-output)

for t in 60 120 180 250; do
  oci budgets alert-rule create --budget-id "$BUDGET_ID" --type ACTUAL \
    --threshold "$t" --threshold-type ABSOLUTE --recipients "$EMAIL" \
    --display-name "actual-$t" --message "QLTT lab: chi phi thuc te vuot \$$t"
done
oci budgets alert-rule create --budget-id "$BUDGET_ID" --type FORECAST \
  --threshold 300 --threshold-type ABSOLUTE --recipients "$EMAIL" --display-name forecast-300
echo "BUDGET_MANUAL_ID=$BUDGET_ID" >> docs/labs/oci/journal.md
```

Budget được đánh giá vài lần mỗi ngày, không real-time. Nó là lưới an toàn, không thay cho việc xem
Cost Analysis mỗi sáng.

---

## 8. Cloudflare API token

Dashboard Cloudflare → **My Profile → API Tokens → Create Token → Create Custom Token**:

| Mục | Giá trị |
| --- | --- |
| Permissions | `Zone` · `DNS` · `Edit` **và** `Zone` · `Zone` · `Read` |
| Zone Resources | `Include` · `Specific zone` · `<domain của bạn>` |
| Client IP filtering | Bỏ trống (NAT gateway OCI chưa có IP) |
| TTL | Hết hạn sau ngày credit hết hạn 1 ngày |

> Bản đề xuất ghi chỉ cần `Zone:DNS:Edit`. external-dns và cert-manager còn cần `Zone:Zone:Read`
> để tìm zone ID, thiếu quyền này chúng báo "no zone found".

```bash
read -rs CF_TOKEN && export CF_TOKEN
curl -s -H "Authorization: Bearer $CF_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify | jq .result.status
curl -s -H "Authorization: Bearer $CF_TOKEN" "https://api.cloudflare.com/client/v4/zones?name=${LAB_DOMAIN#*.}" | jq '.result[0].id'
```

Kiểm tra zone không có bản ghi CAA chặn Let's Encrypt:

```bash
dig +short CAA "${LAB_DOMAIN#*.}"   # rỗng, hoặc có dòng chứa letsencrypt.org
```

Token này sẽ được đưa vào OCI Vault ở Day 1 qua biến `TF_VAR_cloudflare_api_token`. Không lưu vào
file trong repo.

---

## 9. GitHub và Discord

```bash
cd "$LAB_REPO"
git switch k8s-lab && git pull
git switch -c oci-lab && git push -u origin oci-lab
gh auth login
gh api repos/$GITHUB_REPO --jq '.visibility'   # public/private: quyết định runner arm64 ở Day 4
```

Bảo vệ branch `oci-lab` (Settings → Branches → Add rule):

- Require a pull request before merging (không bắt buộc approval vì bạn làm một mình).
- Require status checks: thêm sau Day 1 khi workflow đã chạy lần đầu.
- Không bật "Do not allow bypassing" để bạn vẫn sửa khẩn cấp được.

Discord: tạo channel `#qltt-lab-alerts` trong server riêng (không dùng channel production) →
**Edit Channel → Integrations → Webhooks → New Webhook** → copy URL. Test:

```bash
read -rs DISCORD_WEBHOOK_URL && export DISCORD_WEBHOOK_URL
curl -s -H 'Content-Type: application/json' -d '{"content":"qltt-lab: test Day 0"}' "$DISCORD_WEBHOOK_URL"
```

---

## 10. Journal

```bash
mkdir -p docs/labs/oci
cat > docs/labs/oci/journal.md <<EOF
# Journal lab OCI

## Day 0 · $(date +%F)
- Credit hết hạn: $CREDIT_EXPIRES_AT
- Home region: $OCI_HOME_REGION
- AD: $AD
- Sizing: chuẩn / phương án B (gạch một)
- A1 capacity: AVAILABLE / OUT_OF_HOST_CAPACITY
- Tài nguyên tạo tay: compartment qltt-lab, bucket qltt-tfstate, budget qltt-lab-manual,
  API key, customer secret key tofu-state, Cloudflare token, Discord webhook
EOF
git add docs/labs/oci/journal.md && git commit -m "docs(oci-lab): day 0 journal"
```

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
| --- | --- | --- |
| `NotAuthenticated` khi chạy `oci` | Fingerprint không khớp, hoặc đồng hồ WSL lệch | So fingerprint; `sudo hwclock -s` hoặc `wsl --shutdown` rồi mở lại |
| `NotAuthorizedOrNotFound` khi tạo compartment | User không ở group Administrators | Trial: user đầu tiên là admin; kiểm tra lại đang đăng nhập đúng tenancy |
| S3 `SignatureDoesNotMatch` | Dùng key ID của API key thay vì Customer Secret Key | `AWS_ACCESS_KEY_ID` phải là `id` của customer secret key |
| `oci limits` không trả limit A1 | Tên service/limit đổi | `oci limits definition list --service-name compute --all \| jq -r '.data[].name' \| grep -i a1` |
