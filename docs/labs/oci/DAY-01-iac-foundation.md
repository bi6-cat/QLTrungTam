# Day 1 · IaC foundation với OpenTofu

> Thời lượng: ~4–5 giờ · Chi phí: ~$1 · Đầu vào: Day 0 hoàn tất, `source ~/.qltt-lab.env` chạy được.

## Kết quả cuối ngày (DoD)

- [ ] Stack `foundation` apply xong: tag cost-tracking, Vault + key + secrets, 2 repo OCIR, bucket
      `qltt-cnpg-backup`, user dịch vụ cho cluster và CI, budget bằng code.
- [ ] Stack `lab` apply xong: VCN, 4 subnet, gateway, route table, NSG, bucket `qltt-loki`/`qltt-tempo`.
- [ ] `tofu destroy && tofu apply` của stack `lab` chạy lại từ đầu **< 15 phút**; `tofu plan` lần 2
      báo `No changes`.
- [ ] State lưu trên `qltt-tfstate`, được mã hoá, và đã thử khoá state.
- [ ] PR sửa `infra/oci/**` có comment kết quả `plan` do workflow `infra.yml` tạo.

Vì sao 2 stack: xem [README D1](README.md#chỗ-bộ-hướng-dẫn-khác-bản-đề-xuất-và-lý-do).

```text
envs/foundation  (apply 1 lần, chỉ destroy ở teardown cuối)
  tag namespace qltt · Vault + master key + secrets · OCIR repos
  bucket qltt-cnpg-backup · user svc-qltt-cluster, svc-qltt-ci · policies · budget
        │ outputs (terraform_remote_state)
        ▼
envs/lab  (destroy/apply nhiều lần)
  Day 1: VCN · subnets · gateways · NSG · bucket qltt-loki, qltt-tempo
  Day 2: OKE prod/staging · node pools · add-on · policy workload identity
  Day 6: VM meta-monitor
```

---

## 1. Khung thư mục

```bash
cd "$LAB_REPO" && git switch oci-lab && git switch -c feat/oci-iac-foundation
mkdir -p infra/oci/{modules/{network,storage,vault,budget,service-users},envs/{foundation,lab},scripts}
```

Bổ sung `.gitignore`:

```gitignore
# OCI lab
.terraform/
*.tfstate
*.tfstate.*
*.tfplan
crash.log
infra/oci/envs/*/terraform.tfvars
infra/oci/envs/*/*.auto.tfvars
!infra/oci/envs/*/*.tfvars.example
kubeconfig*
```

`.terraform.lock.hcl` **được** commit để CI và máy bạn dùng cùng bản provider.

---

## 2. Phần dùng chung của mỗi stack

### 2.1 `versions.tf` (giống nhau ở cả 2 stack, chỉ khác `key` của backend)

```hcl
# infra/oci/envs/foundation/versions.tf
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    oci    = { source = "oracle/oci", version = "~> <OCI_PROVIDER_MAJOR>.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  backend "s3" {
    bucket                      = "qltt-tfstate"
    key                         = "foundation/terraform.tfstate"   # lab: "lab/terraform.tfstate"
    region                      = "ap-kulai-2"
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
    # endpoints truyền qua backend.hcl vì chứa namespace
  }

  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method   = method.aes_gcm.main
      enforced = true
    }
    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}
```

```hcl
# infra/oci/envs/foundation/backend.hcl  (commit được, namespace không phải secret)
endpoints = { s3 = "https://<OS_NAMESPACE>.compat.objectstorage.ap-kulai-2.oraclecloud.com" }
```

### 2.2 `providers.tf`

```hcl
provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

# IAM, tag namespace chỉ tạo được ở home region
provider "oci" {
  alias               = "home"
  region              = var.home_region
  config_file_profile = var.oci_profile
}
```

### 2.3 Biến chung

```hcl
# variables.tf (phần chung)
variable "state_passphrase" {
  type      = string
  sensitive = true
}
variable "oci_profile" {
  type    = string
  default = "DEFAULT"
}
variable "region" {
  type    = string
  default = "ap-kulai-2"
}
variable "home_region" { type = string }
variable "tenancy_ocid" { type = string }
variable "compartment_ocid" { type = string }
```

Đưa giá trị từ env vào Tofu, thêm vào `~/.qltt-lab.env`:

```bash
export TF_VAR_home_region=$OCI_HOME_REGION
export TF_VAR_tenancy_ocid=$TENANCY_OCID
export TF_VAR_compartment_ocid=$COMPARTMENT_OCID
export TF_VAR_admin_cidr=$ADMIN_CIDR
```

---

## 3. Stack `foundation`

### 3.1 Module `vault`

```hcl
# infra/oci/modules/vault/main.tf
variable "compartment_id" { type = string }
variable "secret_names" { type = list(string) }
variable "secret_values" {
  type      = map(string)
  sensitive = true
}
variable "tags" { type = map(string) }

resource "oci_kms_vault" "this" {
  compartment_id = var.compartment_id
  display_name   = "qltt-lab"
  vault_type     = "DEFAULT"          # vault dùng chung, miễn phí. KHÔNG dùng VIRTUAL_PRIVATE (tính theo giờ)
  freeform_tags  = var.tags
}

resource "oci_kms_key" "master" {
  compartment_id      = var.compartment_id
  display_name        = "qltt-lab-master"
  management_endpoint = oci_kms_vault.this.management_endpoint
  protection_mode     = "SOFTWARE"
  key_shape {
    algorithm = "AES"
    length    = 32
  }
  freeform_tags = var.tags
}

resource "oci_vault_secret" "this" {
  for_each       = toset(var.secret_names)
  compartment_id = var.compartment_id
  vault_id       = oci_kms_vault.this.id
  key_id         = oci_kms_key.master.id
  secret_name    = each.key
  secret_content {
    content_type = "BASE64"
    content      = base64encode(var.secret_values[each.key])
  }
  freeform_tags = var.tags
}

output "vault_id" { value = oci_kms_vault.this.id }
output "key_id" { value = oci_kms_key.master.id }
```

> `for_each` dùng `secret_names` (không sensitive), còn giá trị lấy từ map sensitive. Nếu dùng
> `keys(var.secret_values)` Tofu sẽ báo không được `for_each` trên giá trị sensitive.

### 3.2 Module `service-users`

Hai user dịch vụ, mỗi user một quyền hẹp:

| User | Credential | Dùng ở đâu | Quyền |
| --- | --- | --- | --- |
| `svc-qltt-cluster` | Customer Secret Key, Auth Token | CNPG/Loki/Tempo ghi bucket; kubelet pull OCIR | object trong 3 bucket; đọc repo |
| `svc-qltt-ci` | API key, Customer Secret Key, Auth Token | GitHub Actions: `tofu plan`, push image | đọc tài nguyên; object trong `qltt-tfstate`; quản lý repo |

```hcl
# infra/oci/modules/service-users/main.tf
variable "tenancy_id" { type = string }
variable "compartment_id" { type = string }
variable "email_domain" { type = string }   # user identity domain cần email; dùng alias mail của bạn

terraform {
  required_providers {
    oci = { source = "oracle/oci", configuration_aliases = [oci.home] }
    tls = { source = "hashicorp/tls" }
  }
}

locals {
  c = "compartment id ${var.compartment_id}"
}

# ---- cluster ----
resource "oci_identity_group" "cluster" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-cluster-svc"
  description    = "QLTT lab: workloads in OKE"
}
resource "oci_identity_user" "cluster" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "svc-qltt-cluster"
  description    = "QLTT lab: S3-compat + OCIR pull"
  email          = "svc-qltt-cluster@${var.email_domain}"
}
resource "oci_identity_user_group_membership" "cluster" {
  provider = oci.home
  group_id = oci_identity_group.cluster.id
  user_id  = oci_identity_user.cluster.id
}
resource "oci_identity_customer_secret_key" "cluster" {
  provider     = oci.home
  user_id      = oci_identity_user.cluster.id
  display_name = "cluster-s3"
}
resource "oci_identity_auth_token" "cluster" {
  provider    = oci.home
  user_id     = oci_identity_user.cluster.id
  description = "ocir-pull"
}
resource "oci_identity_policy" "cluster" {
  provider       = oci.home
  compartment_id = var.compartment_id
  name           = "qltt-cluster-svc"
  description    = "QLTT lab: cluster service user"
  statements = [
    "Allow group 'Default'/'qltt-cluster-svc' to read repos in ${local.c}",
    "Allow group 'Default'/'qltt-cluster-svc' to read buckets in ${local.c}",
    "Allow group 'Default'/'qltt-cluster-svc' to manage objects in ${local.c} where any {target.bucket.name='qltt-cnpg-backup', target.bucket.name='qltt-loki', target.bucket.name='qltt-tempo'}",
  ]
}

# ---- CI ----
resource "oci_identity_group" "ci" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-ci"
  description    = "QLTT lab: GitHub Actions"
}
resource "oci_identity_user" "ci" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "svc-qltt-ci"
  description    = "QLTT lab: tofu plan + OCIR push"
  email          = "svc-qltt-ci@${var.email_domain}"
}
resource "oci_identity_user_group_membership" "ci" {
  provider = oci.home
  group_id = oci_identity_group.ci.id
  user_id  = oci_identity_user.ci.id
}
resource "tls_private_key" "ci" {
  algorithm = "RSA"
  rsa_bits  = 2048
}
resource "oci_identity_api_key" "ci" {
  provider  = oci.home
  user_id   = oci_identity_user.ci.id
  key_value = tls_private_key.ci.public_key_pem
}
resource "oci_identity_customer_secret_key" "ci" {
  provider     = oci.home
  user_id      = oci_identity_user.ci.id
  display_name = "ci-tfstate"
}
resource "oci_identity_auth_token" "ci" {
  provider    = oci.home
  user_id     = oci_identity_user.ci.id
  description = "ocir-push"
}
# "read all-resources" phải gắn ở root compartment
resource "oci_identity_policy" "ci_tenancy" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-ci-read"
  description    = "QLTT lab: CI plan refresh"
  statements = [
    "Allow group 'Default'/'qltt-ci' to read all-resources in tenancy",
  ]
}
resource "oci_identity_policy" "ci_compartment" {
  provider       = oci.home
  compartment_id = var.compartment_id
  name           = "qltt-ci-write"
  description    = "QLTT lab: CI state lock + OCIR push"
  statements = [
    "Allow group 'Default'/'qltt-ci' to manage objects in ${local.c} where target.bucket.name='qltt-tfstate'",
    "Allow group 'Default'/'qltt-ci' to manage repos in ${local.c}",
  ]
}

output "cluster_s3_access_key_id" { value = oci_identity_customer_secret_key.cluster.id }
output "cluster_s3_secret_key" {
  value     = oci_identity_customer_secret_key.cluster.key
  sensitive = true
}
output "cluster_ocir_username" { value = oci_identity_user.cluster.name }
output "cluster_ocir_token" {
  value     = oci_identity_auth_token.cluster.token
  sensitive = true
}
output "ci" {
  sensitive = true
  value = {
    user_ocid       = oci_identity_user.ci.id
    fingerprint     = oci_identity_api_key.ci.fingerprint
    private_key_pem = tls_private_key.ci.private_key_pem
    s3_access_key   = oci_identity_customer_secret_key.ci.id
    s3_secret_key   = oci_identity_customer_secret_key.ci.key
    ocir_username   = oci_identity_user.ci.name
    ocir_token      = oci_identity_auth_token.ci.token
  }
}
```

> `read all-resources in tenancy` cho phép CI đọc cả nội dung secret trong Vault. Chấp nhận trong lab,
> bù lại bằng cách để credential CI trong GitHub **Environment** có protection (mục 5). Ghi điều này
> vào báo cáo như một điểm cần siết nếu làm thật.

### 3.3 Module `budget`

```hcl
# infra/oci/modules/budget/main.tf
variable "tenancy_id" { type = string }
variable "amount" { type = number }
variable "actual_thresholds" { type = list(number) }
variable "forecast_threshold" { type = number }
variable "recipients" { type = string }

resource "oci_budget_budget" "this" {
  compartment_id = var.tenancy_id
  amount         = var.amount
  reset_period   = "MONTHLY"
  target_type    = "COMPARTMENT"
  targets        = [var.tenancy_id]          # cả tenancy, bắt cả tài nguyên tạo nhầm chỗ
  display_name   = "qltt-lab"
}

resource "oci_budget_alert_rule" "actual" {
  for_each       = toset([for t in var.actual_thresholds : tostring(t)])
  budget_id      = oci_budget_budget.this.id
  type           = "ACTUAL"
  threshold      = tonumber(each.key)
  threshold_type = "ABSOLUTE"
  recipients     = var.recipients
  display_name   = "actual-${each.key}"
  message        = "QLTT lab: chi phi thuc te vuot $${each.key}"
}

resource "oci_budget_alert_rule" "forecast" {
  budget_id      = oci_budget_budget.this.id
  type           = "FORECAST"
  threshold      = var.forecast_threshold
  threshold_type = "ABSOLUTE"
  recipients     = var.recipients
  display_name   = "forecast-${var.forecast_threshold}"
}
```

### 3.4 `envs/foundation/main.tf`

```hcl
data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.tenancy_ocid
}

locals {
  tags = { project = "qltt-lab", "managed-by" = "opentofu", stack = "foundation" }
}

# ---- Tag cost-tracking (dùng ở stack lab, không dùng trong chính stack này) ----
resource "oci_identity_tag_namespace" "qltt" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt"
  description    = "QLTT lab"
}
resource "oci_identity_tag" "project" {
  provider         = oci.home
  tag_namespace_id = oci_identity_tag_namespace.qltt.id
  name             = "project"
  description      = "Cost tracking"
  is_cost_tracking = true
}
resource "oci_identity_tag" "cluster" {
  provider         = oci.home
  tag_namespace_id = oci_identity_tag_namespace.qltt.id
  name             = "cluster"
  description      = "prod | staging | meta"
}

# ---- OCIR ----
resource "oci_artifacts_container_repository" "repos" {
  for_each       = toset(["qltrungtam", "qltrungtam-migrate"])
  compartment_id = var.compartment_ocid
  display_name   = each.key
  is_public      = false
  freeform_tags  = local.tags
}

# ---- Bucket backup DB: sống lâu hơn cluster ----
resource "oci_objectstorage_bucket" "cnpg_backup" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "qltt-cnpg-backup"
  access_type    = "NoPublicAccess"
  freeform_tags  = local.tags
  lifecycle {
    prevent_destroy = true   # Day 10 teardown cuối mới gỡ dòng này
  }
}

module "service_users" {
  source         = "../../modules/service-users"
  providers      = { oci.home = oci.home }
  tenancy_id     = var.tenancy_ocid
  compartment_id = var.compartment_ocid
  email_domain   = var.svc_email_domain
}

# ---- Secret sinh ngẫu nhiên ----
resource "random_password" "p" {
  for_each = {
    "qltt-session-secret-prod"      = 48
    "qltt-session-secret-staging"   = 48
    "qltt-admin-password"           = 20
    "qltt-sepay-webhook-secret"     = 40
    "qltt-db-app-password-prod"     = 32
    "qltt-db-app-password-staging"  = 32
    "qltt-grafana-admin-password"   = 24
    "qltt-valkey-password"          = 32
  }
  length  = each.value
  special = false          # URL-safe, nhúng thẳng được vào DATABASE_URL/REDIS_URL
}

locals {
  secret_values = merge(
    { for k, v in random_password.p : k => v.result },
    {
      "qltt-cloudflare-api-token" = var.cloudflare_api_token
      "qltt-discord-webhook-url"  = var.discord_webhook_url
      "qltt-s3-access-key-id"     = module.service_users.cluster_s3_access_key_id
      "qltt-s3-secret-access-key" = module.service_users.cluster_s3_secret_key
      "qltt-ocir-dockerconfigjson" = jsonencode({
        auths = {
          "${var.region}.ocir.io" = {
            username = "${data.oci_objectstorage_namespace.ns.namespace}/${module.service_users.cluster_ocir_username}"
            password = module.service_users.cluster_ocir_token
          }
        }
      })
    }
  )
  # Danh sách tên phải khai báo tĩnh, không suy ra từ map sensitive
  secret_names = [
    "qltt-session-secret-prod", "qltt-session-secret-staging", "qltt-admin-password",
    "qltt-sepay-webhook-secret", "qltt-db-app-password-prod", "qltt-db-app-password-staging",
    "qltt-grafana-admin-password", "qltt-valkey-password", "qltt-cloudflare-api-token",
    "qltt-discord-webhook-url", "qltt-s3-access-key-id", "qltt-s3-secret-access-key",
    "qltt-ocir-dockerconfigjson",
  ]
}

module "vault" {
  source         = "../../modules/vault"
  compartment_id = var.compartment_ocid
  secret_names   = local.secret_names
  secret_values  = local.secret_values
  tags           = local.tags
}

module "budget" {
  source             = "../../modules/budget"
  tenancy_id         = var.tenancy_ocid
  amount             = 360
  actual_thresholds  = [60, 120, 180, 250]
  forecast_threshold = 300
  recipients         = var.budget_email
}
```

```hcl
# envs/foundation/variables.tf (bổ sung)
variable "svc_email_domain" { type = string }
variable "budget_email" { type = string }
variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}
variable "discord_webhook_url" {
  type      = string
  sensitive = true
}
```

```hcl
# envs/foundation/outputs.tf
output "namespace" { value = data.oci_objectstorage_namespace.ns.namespace }
output "vault_id" { value = module.vault.vault_id }
output "tag_namespace" { value = oci_identity_tag_namespace.qltt.name }
output "ocir_repos" {
  value = { for k, r in oci_artifacts_container_repository.repos : k => "${var.region}.ocir.io/${data.oci_objectstorage_namespace.ns.namespace}/${k}" }
}
output "cnpg_backup_bucket" { value = oci_objectstorage_bucket.cnpg_backup.name }
output "ci" {
  value     = module.service_users.ci
  sensitive = true
}
```

### 3.5 Apply foundation

```bash
cd "$LAB_REPO/infra/oci/envs/foundation"
sed "s/<OS_NAMESPACE>/$OS_NAMESPACE/" > backend.hcl <<'EOF'
endpoints = { s3 = "https://<OS_NAMESPACE>.compat.objectstorage.ap-kulai-2.oraclecloud.com" }
EOF

export TF_VAR_svc_email_domain=example.com          # domain email bạn nhận được thư
export TF_VAR_budget_email=you@example.com
read -rs TF_VAR_cloudflare_api_token && export TF_VAR_cloudflare_api_token
read -rs TF_VAR_discord_webhook_url && export TF_VAR_discord_webhook_url

tofu init -backend-config=backend.hcl
tofu fmt -recursive ../../
tofu validate
tofu plan -out foundation.tfplan
tofu apply foundation.tfplan
```

Các lỗi hay gặp ở lần apply đầu:

| Lỗi | Xử lý |
| --- | --- |
| `404 NotAuthorizedOrNotFound` khi tạo user/group | Provider `oci.home` trỏ sai home region |
| Email bắt buộc / user bị gửi mail kích hoạt | Bình thường với identity domain; user dịch vụ không cần đăng nhập Console |
| Policy báo `group not found` ngay sau khi tạo group | IAM propagate chậm, chạy lại `tofu apply` sau 1 phút |
| Secret tạo lâu (vài phút) | Vault mới cần thời gian `ACTIVE`, chờ |

Sau khi apply thành công, **xoá budget tạo tay ở Day 0** để không nhận email trùng:

```bash
oci budgets budget delete --budget-id "$(grep BUDGET_MANUAL_ID ../../../../docs/labs/oci/journal.md | cut -d= -f2)" --force
```

Kiểm tra mã hoá state (file trên bucket không được đọc ra plaintext):

```bash
oci os object get --bucket-name qltt-tfstate --name foundation/terraform.tfstate --file - | head -c 200; echo
# kỳ vọng: JSON có "encrypted_data", không thấy "resources"
```

### 3.6 Thử khoá state

Mở 2 terminal ở cùng thư mục:

```bash
# terminal 1
tofu apply -replace=random_password.p[\"qltt-grafana-admin-password\"]   # dừng ở câu hỏi yes/no, đừng trả lời
# terminal 2
tofu plan
```

- Terminal 2 báo `Error acquiring the state lock` → locking hoạt động. Ở terminal 1 trả lời `no`.
- Terminal 2 chạy plan bình thường → endpoint S3-compat không hỗ trợ ghi có điều kiện, **locking
  không có tác dụng**. Chọn một:
  1. Chuyển sang Terraform ≥ 1.12 với `backend "oci"` (hỗ trợ khoá gốc).
  2. Giữ OpenTofu, quy ước chỉ apply từ máy bạn, CI chỉ `plan -lock=false`. Ghi rõ rủi ro trong
     báo cáo.

Ghi kết quả vào journal.

---

## 4. Stack `lab`: network + bucket tạm

### 4.1 Địa chỉ mạng

| Subnet | CIDR | Loại | Dùng cho |
| --- | --- | --- | --- |
| `sn-api` | `10.60.0.0/28` | public | Kubernetes API endpoint của cả 2 cluster (public IP bắt buộc subnet public) |
| `sn-public` | `10.60.1.0/24` | public | NLB public/internal, VM meta-monitor |
| `sn-workers` | `10.60.8.0/22` | private | Node của mọi pool |
| `sn-pods` | `10.60.32.0/19` | private | IP pod (VCN-native, mỗi pod 1 IP VCN) |

Cả 2 cluster dùng chung subnet để tiết kiệm công. Trong báo cáo, ghi đây là điểm đơn giản hoá: pod
staging và prod cùng NSG, thực tế nên tách VCN hoặc ít nhất tách NSG.

### 4.2 Module `network`

```hcl
# infra/oci/modules/network/variables.tf
variable "compartment_id" { type = string }
variable "name" { type = string }
variable "vcn_cidr" {
  type    = string
  default = "10.60.0.0/16"
}
variable "subnets" {
  type = map(object({ cidr = string, public = bool, dns = string }))
  default = {
    api     = { cidr = "10.60.0.0/28", public = true, dns = "api" }
    public  = { cidr = "10.60.1.0/24", public = true, dns = "pub" }
    workers = { cidr = "10.60.8.0/22", public = false, dns = "workers" }
    pods    = { cidr = "10.60.32.0/19", public = false, dns = "pods" }
  }
}
variable "admin_cidr" { type = string }
variable "envoy_node_ports" {
  type    = list(number)
  default = [30080, 30443]     # Day 3 pin nodePort của Envoy về đúng 2 cổng này
}
variable "tags" { type = map(string) }
```

```hcl
# infra/oci/modules/network/main.tf
resource "oci_core_vcn" "this" {
  compartment_id = var.compartment_id
  cidr_blocks    = [var.vcn_cidr]
  display_name   = "${var.name}-vcn"
  dns_label      = "qlttlab"
  freeform_tags  = var.tags
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-igw"
  enabled        = true
  freeform_tags  = var.tags
}

resource "oci_core_nat_gateway" "nat" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-nat"
  freeform_tags  = var.tags
}

data "oci_core_services" "osn" {
  filter {
    name   = "name"
    values = ["All .* Services In Oracle Services Network"]
    regex  = true
  }
}

resource "oci_core_service_gateway" "sgw" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-sgw"
  services {
    service_id = data.oci_core_services.osn.services[0].id
  }
  freeform_tags = var.tags
}

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-rt-public"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
  freeform_tags = var.tags
}

resource "oci_core_route_table" "private" {
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-rt-private"
  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_nat_gateway.nat.id
  }
  route_rules {
    destination       = data.oci_core_services.osn.services[0].cidr_block
    destination_type  = "SERVICE_CIDR_BLOCK"
    network_entity_id = oci_core_service_gateway.sgw.id
  }
  freeform_tags = var.tags
}

# Security list mặc định có rule SSH 0.0.0.0/0. Quản lý nó với 0 rule: mọi kiểm soát nằm ở NSG.
resource "oci_core_default_security_list" "lockdown" {
  manage_default_resource_id = oci_core_vcn.this.default_security_list_id
  display_name               = "${var.name}-default-sl-empty"
}

resource "oci_core_subnet" "this" {
  for_each                   = var.subnets
  compartment_id             = var.compartment_id
  vcn_id                     = oci_core_vcn.this.id
  cidr_block                 = each.value.cidr
  display_name               = "${var.name}-sn-${each.key}"
  dns_label                  = each.value.dns
  prohibit_public_ip_on_vnic = !each.value.public
  route_table_id             = each.value.public ? oci_core_route_table.public.id : oci_core_route_table.private.id
  security_list_ids          = [oci_core_vcn.this.default_security_list_id]
  freeform_tags              = var.tags
}
```

### 4.3 NSG

Rule dưới đây là tối thiểu cho OKE **VCN-native pod networking** + NLB giữ IP nguồn. Đối chiếu một
lần với trang "Network Resource Configuration for Cluster Creation" của OKE trước khi apply.

```hcl
# infra/oci/modules/network/nsg.tf
locals {
  cidr    = { for k, s in var.subnets : k => s.cidr }
  osn     = data.oci_core_services.osn.services[0].cidr_block
  anywhere = "0.0.0.0/0"

  # proto: "6"=TCP, "17"=UDP, "1"=ICMP, "all"
  # peer_type: CIDR_BLOCK | SERVICE_CIDR_BLOCK
  rules = concat(
    # ---------- API endpoint ----------
    [
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "workers->api 6443" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "pods->api 6443" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [12250, 12250], icmp = null, desc = "workers->api 12250" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = [12250, 12250], icmp = null, desc = "pods->api 12250" },
      { nsg = "api", dir = "INGRESS", proto = "6", peer = var.admin_cidr, peer_type = "CIDR_BLOCK", ports = [6443, 6443], icmp = null, desc = "admin->api" },
      { nsg = "api", dir = "INGRESS", proto = "1", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
      { nsg = "api", dir = "EGRESS", proto = "6", peer = local.osn, peer_type = "SERVICE_CIDR_BLOCK", ports = null, icmp = null, desc = "api->oracle services" },
      { nsg = "api", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [10250, 10250], icmp = null, desc = "api->kubelet" },
      { nsg = "api", dir = "EGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "api->pods (webhooks)" },
      { nsg = "api", dir = "EGRESS", proto = "1", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
    ],
    # ---------- Workers ----------
    [
      { nsg = "workers", dir = "INGRESS", proto = "all", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "node<->node" },
      { nsg = "workers", dir = "INGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "pods->node" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.api, peer_type = "CIDR_BLOCK", ports = [10250, 10250], icmp = null, desc = "api->kubelet" },
      { nsg = "workers", dir = "INGRESS", proto = "1", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = [3, 4], desc = "path mtu" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb health/internal nlb/meta" },
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [10256, 10256], icmp = null, desc = "kube-proxy health" },
      { nsg = "workers", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
    # NLB giữ IP nguồn: gói tin tới NodePort Envoy mang IP client
    [for p in var.envoy_node_ports :
      { nsg = "workers", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [p, p], icmp = null, desc = "internet->envoy nodeport ${p}" }
    ],
    # ---------- Pods ----------
    [
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "node->pod" },
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.pods, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "pod<->pod" },
      { nsg = "pods", dir = "INGRESS", proto = "all", peer = local.cidr.api, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "api->pod" },
      # Sau DNAT của kube-proxy, IP nguồn vẫn là client; Envoy nghe 10080/10443 trong pod
      { nsg = "pods", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [10080, 10080], icmp = null, desc = "client->envoy http" },
      { nsg = "pods", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [10443, 10443], icmp = null, desc = "client->envoy https" },
      { nsg = "pods", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
    # ---------- NLB public ----------
    [
      { nsg = "nlb", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [80, 80], icmp = null, desc = "http" },
      { nsg = "nlb", dir = "INGRESS", proto = "6", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = [443, 443], icmp = null, desc = "https" },
      { nsg = "nlb", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb->nodeports" },
      { nsg = "nlb", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [10256, 10256], icmp = null, desc = "nlb->kube-proxy health" },
    ],
    # ---------- NLB internal (Prometheus/Alertmanager cho meta-monitor, Day 6) ----------
    [
      { nsg = "nlb_internal", dir = "INGRESS", proto = "6", peer = local.cidr.public, peer_type = "CIDR_BLOCK", ports = [9090, 9093], icmp = null, desc = "meta->prom/am" },
      { nsg = "nlb_internal", dir = "EGRESS", proto = "6", peer = local.cidr.workers, peer_type = "CIDR_BLOCK", ports = [30000, 32767], icmp = null, desc = "nlb->nodeports" },
    ],
    # ---------- Meta-monitor VM ----------
    [
      { nsg = "meta", dir = "INGRESS", proto = "6", peer = var.admin_cidr, peer_type = "CIDR_BLOCK", ports = [22, 22], icmp = null, desc = "ssh admin" },
      { nsg = "meta", dir = "EGRESS", proto = "all", peer = local.anywhere, peer_type = "CIDR_BLOCK", ports = null, icmp = null, desc = "egress" },
    ],
  )
}

resource "oci_core_network_security_group" "this" {
  for_each       = toset(["api", "workers", "pods", "nlb", "nlb_internal", "meta"])
  compartment_id = var.compartment_id
  vcn_id         = oci_core_vcn.this.id
  display_name   = "${var.name}-nsg-${each.key}"
  freeform_tags  = var.tags
}

resource "oci_core_network_security_group_security_rule" "this" {
  for_each                  = { for r in local.rules : "${r.nsg}|${r.dir}|${r.desc}" => r }
  network_security_group_id = oci_core_network_security_group.this[each.value.nsg].id
  direction                 = each.value.dir
  protocol                  = each.value.proto
  description               = each.value.desc
  stateless                 = false

  source           = each.value.dir == "INGRESS" ? each.value.peer : null
  source_type      = each.value.dir == "INGRESS" ? each.value.peer_type : null
  destination      = each.value.dir == "EGRESS" ? each.value.peer : null
  destination_type = each.value.dir == "EGRESS" ? each.value.peer_type : null

  dynamic "tcp_options" {
    for_each = each.value.proto == "6" && each.value.ports != null ? [each.value.ports] : []
    content {
      destination_port_range {
        min = tcp_options.value[0]
        max = tcp_options.value[1]
      }
    }
  }
  dynamic "icmp_options" {
    for_each = each.value.proto == "1" && each.value.icmp != null ? [each.value.icmp] : []
    content {
      type = icmp_options.value[0]
      code = icmp_options.value[1]
    }
  }
}
```

```hcl
# infra/oci/modules/network/outputs.tf
output "vcn_id" { value = oci_core_vcn.this.id }
output "subnet_ids" { value = { for k, s in oci_core_subnet.this : k => s.id } }
output "subnet_cidrs" { value = { for k, s in oci_core_subnet.this : k => s.cidr_block } }
output "nsg_ids" { value = { for k, n in oci_core_network_security_group.this : k => n.id } }
```

> Rule `icmp = [3, 4]` là type 3 code 4 (Fragmentation Needed). Thiếu rule này, request lớn (xuất
> Excel, ảnh QR) có thể treo ngẫu nhiên khi MTU lệch.

### 4.4 Module `storage` và `envs/lab/main.tf`

```hcl
# infra/oci/modules/storage/main.tf
variable "compartment_id" { type = string }
variable "namespace" { type = string }
variable "buckets" { type = list(string) }
variable "tags" { type = map(string) }

resource "oci_objectstorage_bucket" "this" {
  for_each       = toset(var.buckets)
  compartment_id = var.compartment_id
  namespace      = var.namespace
  name           = each.key
  access_type    = "NoPublicAccess"
  freeform_tags  = var.tags
}
output "names" { value = [for b in oci_objectstorage_bucket.this : b.name] }
```

```hcl
# infra/oci/envs/lab/main.tf
data "terraform_remote_state" "foundation" {
  backend = "s3"
  config = {
    bucket                      = "qltt-tfstate"
    key                         = "foundation/terraform.tfstate"
    region                      = "ap-kulai-2"
    endpoints                   = { s3 = var.s3_endpoint }
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
  }
}

locals {
  f    = data.terraform_remote_state.foundation.outputs
  tags = { project = "qltt-lab", "managed-by" = "opentofu", stack = "lab" }
}

module "network" {
  source         = "../../modules/network"
  compartment_id = var.compartment_ocid
  name           = "qltt"
  admin_cidr     = var.admin_cidr
  tags           = local.tags
}

module "storage" {
  source         = "../../modules/storage"
  compartment_id = var.compartment_ocid
  namespace      = local.f.namespace
  buckets        = ["qltt-loki", "qltt-tempo"]
  tags           = local.tags
}
```

State của foundation đã mã hoá, nên stack `lab` phải khai báo cách giải mã remote state. Thêm vào
khối `encryption` trong `envs/lab/versions.tf`:

```hcl
  encryption {
    key_provider "pbkdf2" "main" { passphrase = var.state_passphrase }
    method "aes_gcm" "main" { keys = key_provider.pbkdf2.main }
    state {
      method   = method.aes_gcm.main
      enforced = true
    }
    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
    remote_state_data_sources {
      default {
        method = method.aes_gcm.main
      }
    }
  }
```

```hcl
# envs/lab/variables.tf (bổ sung)
variable "admin_cidr" { type = string }
variable "s3_endpoint" { type = string }
```

```bash
echo 'export TF_VAR_s3_endpoint=$S3_ENDPOINT' >> ~/.qltt-lab.env && source ~/.qltt-lab.env
cd "$LAB_REPO/infra/oci/envs/lab"
cp ../foundation/backend.hcl .
tofu init -backend-config=backend.hcl
tofu plan -out lab.tfplan && tofu apply lab.tfplan
```

---

## 5. Workflow `infra.yml`

### 5.1 Secret trong GitHub Environment

Tạo Environment `lab-plan` (Settings → Environments). Chỉ cho branch `oci-lab` và PR vào `oci-lab`
dùng (Deployment branches and tags → Selected branches).

```bash
cd "$LAB_REPO/infra/oci/envs/foundation"
CI=$(tofu output -json ci)
gh secret set OCI_CI_USER_OCID   --env lab-plan --body "$(jq -r .user_ocid <<<"$CI")"
gh secret set OCI_CI_FINGERPRINT --env lab-plan --body "$(jq -r .fingerprint <<<"$CI")"
gh secret set OCI_CI_PRIVATE_KEY --env lab-plan --body "$(jq -r .private_key_pem <<<"$CI")"
gh secret set CI_S3_ACCESS_KEY   --env lab-plan --body "$(jq -r .s3_access_key <<<"$CI")"
gh secret set CI_S3_SECRET_KEY   --env lab-plan --body "$(jq -r .s3_secret_key <<<"$CI")"
gh secret set STATE_PASSPHRASE   --env lab-plan --body "$TF_VAR_state_passphrase"
gh secret set CLOUDFLARE_API_TOKEN --env lab-plan --body "$TF_VAR_cloudflare_api_token"
gh secret set DISCORD_WEBHOOK_URL  --env lab-plan --body "$TF_VAR_discord_webhook_url"
gh variable set OCI_TENANCY_OCID     --env lab-plan --body "$TENANCY_OCID"
gh variable set OCI_COMPARTMENT_OCID --env lab-plan --body "$COMPARTMENT_OCID"
gh variable set OCI_HOME_REGION      --env lab-plan --body "$OCI_HOME_REGION"
gh variable set S3_ENDPOINT          --env lab-plan --body "$S3_ENDPOINT"
gh variable set ADMIN_CIDR           --env lab-plan --body "$ADMIN_CIDR"
gh variable set SVC_EMAIL_DOMAIN     --env lab-plan --body "$TF_VAR_svc_email_domain"
gh variable set BUDGET_EMAIL         --env lab-plan --body "$TF_VAR_budget_email"
unset CI
```

> `CLOUDFLARE_API_TOKEN` và `DISCORD_WEBHOOK_URL` phải có trong CI, nếu không `plan` của foundation
> sẽ thấy giá trị rỗng và đề xuất ghi đè secret trong Vault.

### 5.2 Workflow

```yaml
# .github/workflows/infra.yml
name: infra
on:
  pull_request:
    branches: [oci-lab]
    paths: ["infra/oci/**", ".github/workflows/infra.yml"]

permissions:
  contents: read
  pull-requests: write

concurrency:
  group: infra-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  static:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1
        with: { tofu_wrapper: false }
      - run: tofu fmt -check -recursive infra/oci
      - uses: terraform-linters/setup-tflint@v4
      - run: tflint --init && tflint --recursive --chdir infra/oci
      - name: Trivy config scan
        uses: aquasecurity/trivy-action@0.33.1   # pin theo bản mới nhất lúc làm lab
        with:
          scan-type: config
          scan-ref: infra/oci
          severity: HIGH,CRITICAL
          exit-code: "1"

  plan:
    needs: static
    runs-on: ubuntu-24.04
    environment: lab-plan
    strategy:
      fail-fast: false
      max-parallel: 1              # lab đọc remote state của foundation
      matrix:
        stack: [foundation, lab]
    env:
      AWS_ACCESS_KEY_ID: ${{ secrets.CI_S3_ACCESS_KEY }}
      AWS_SECRET_ACCESS_KEY: ${{ secrets.CI_S3_SECRET_KEY }}
      AWS_REQUEST_CHECKSUM_CALCULATION: when_required
      AWS_RESPONSE_CHECKSUM_VALIDATION: when_required
      TF_VAR_state_passphrase: ${{ secrets.STATE_PASSPHRASE }}
      TF_VAR_tenancy_ocid: ${{ vars.OCI_TENANCY_OCID }}
      TF_VAR_compartment_ocid: ${{ vars.OCI_COMPARTMENT_OCID }}
      TF_VAR_home_region: ${{ vars.OCI_HOME_REGION }}
      TF_VAR_s3_endpoint: ${{ vars.S3_ENDPOINT }}
      TF_VAR_admin_cidr: ${{ vars.ADMIN_CIDR }}
      TF_VAR_svc_email_domain: ${{ vars.SVC_EMAIL_DOMAIN }}
      TF_VAR_budget_email: ${{ vars.BUDGET_EMAIL }}
      TF_VAR_cloudflare_api_token: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      TF_VAR_discord_webhook_url: ${{ secrets.DISCORD_WEBHOOK_URL }}
    defaults:
      run:
        working-directory: infra/oci/envs/${{ matrix.stack }}
    steps:
      - uses: actions/checkout@v4
      - uses: opentofu/setup-opentofu@v1
        with: { tofu_wrapper: false }
      - name: OCI config
        run: |
          mkdir -p ~/.oci
          printf '%s\n' "${{ secrets.OCI_CI_PRIVATE_KEY }}" > ~/.oci/key.pem
          chmod 600 ~/.oci/key.pem
          cat > ~/.oci/config <<EOF
          [DEFAULT]
          user=${{ secrets.OCI_CI_USER_OCID }}
          fingerprint=${{ secrets.OCI_CI_FINGERPRINT }}
          tenancy=${{ vars.OCI_TENANCY_OCID }}
          region=ap-kulai-2
          key_file=~/.oci/key.pem
          EOF
          chmod 600 ~/.oci/config
      - run: tofu init -input=false -backend-config=backend.hcl
      - run: tofu validate
      - id: plan
        run: |
          set +e
          tofu plan -input=false -lock=false -no-color -detailed-exitcode -out plan.bin > plan.txt 2>&1
          ec=$?
          echo "exitcode=$ec" >> "$GITHUB_OUTPUT"
          [ $ec -eq 1 ] && { cat plan.txt; exit 1; }
          exit 0
      - name: Comment plan
        uses: actions/github-script@v7
        env:
          STACK: ${{ matrix.stack }}
          EXITCODE: ${{ steps.plan.outputs.exitcode }}
        with:
          script: |
            const fs = require('fs');
            let body = fs.readFileSync(`infra/oci/envs/${process.env.STACK}/plan.txt`, 'utf8');
            const summary = (body.match(/^Plan: .*$/m) || body.match(/No changes\..*$/m) || ['?'])[0];
            if (body.length > 60000) body = body.slice(-60000);
            await github.rest.issues.createComment({
              ...context.repo, issue_number: context.issue.number,
              body: `### tofu plan · \`${process.env.STACK}\` · ${summary}\n<details><summary>chi tiết</summary>\n\n\`\`\`\n${body}\n\`\`\`\n</details>`
            });
```

`-lock=false` trong CI: plan không ghi state, và CI không nên giữ khoá chặn bạn apply từ máy. Apply
chỉ chạy từ máy bạn.

Trivy sẽ báo HIGH cho các rule cố ý mở `0.0.0.0/0` (NLB 80/443, NodePort Envoy) và subnet public.
Không hạ `severity` để né: tạo `infra/oci/.trivyignore`, mỗi ID một dòng kèm comment lý do, ví dụ
`# NLB public phải nhận 443 từ internet`. Reviewer đọc được vì sao từng cảnh báo được chấp nhận.

`.tflint.hcl` ở `infra/oci/`:

```hcl
plugin "terraform" {
  enabled = true
  preset  = "recommended"
}
```

Mở PR `feat/oci-iac-foundation → oci-lab`, kiểm tra có 2 comment plan. Sau khi workflow chạy lần đầu,
vào Branch protection của `oci-lab` thêm required checks `static` và `plan (foundation)`, `plan (lab)`.

---

## 6. Kiểm tra DoD

```bash
cd "$LAB_REPO/infra/oci/envs/lab"
time (tofu destroy -auto-approve && tofu apply -auto-approve)
tofu plan -detailed-exitcode; echo "exit=$?"     # 0 = No changes
```

Ghi thời gian vào journal. Nếu `plan` lần 2 vẫn có thay đổi, thường do:

| Diff lặp lại | Sửa |
| --- | --- |
| `defined_tags` có `Oracle-Tags.CreatedBy/CreatedOn` | Thêm `lifecycle { ignore_changes = [defined_tags] }` vào resource bị diff |
| `route_rules` đổi thứ tự | Khai báo route rule theo đúng thứ tự Console trả về |
| `description` NSG rule rỗng | Luôn đặt `description` |

Kiểm tra thủ công:

```bash
oci network vcn list -c "$COMPARTMENT_OCID" --query 'data[].{"name":"display-name",cidr:"cidr-blocks"}' --output table
oci network nsg list -c "$COMPARTMENT_OCID" --query 'data[]."display-name"' --output table
oci network security-list list -c "$COMPARTMENT_OCID" --query 'data[].{"name":"display-name",in:length("ingress-security-rules")}' --output table   # in = 0
oci vault secret list -c "$COMPARTMENT_OCID" --query 'data[]."secret-name"' --output table
```

## 7. Stretch

**Pre-commit** (`.pre-commit-config.yaml` ở root repo):

```yaml
repos:
  - repo: https://github.com/tofuutils/pre-commit-opentofu
    rev: <pin>
    hooks:
      - id: tofu_fmt
      - id: tofu_validate
      - id: tofu_tflint
  - repo: https://github.com/gitleaks/gitleaks
    rev: <pin>
    hooks:
      - id: gitleaks
```

**OCI Bastion**: thêm `oci_bastion_bastion` (target subnet `sn-workers`, `client_cidr_block_allow_list =
[var.admin_cidr]`). Dùng khi muốn chuyển API endpoint sang private ở Day 2.

## 8. Commit cuối ngày

```bash
cd "$LAB_REPO"
git add .gitignore infra/oci .github/workflows/infra.yml
git commit -m "feat(oci-lab): foundation and network stacks with encrypted state"
git push -u origin feat/oci-iac-foundation
gh pr create --base oci-lab --title "OCI lab Day 1: IaC foundation" --body "Foundation + lab network stacks, CI plan."
```
