# Day 2 · OKE clusters

> Thời lượng: ~4 giờ (tạo cluster + node pool mất 15–25 phút mỗi lần) · Chi phí: ~$8
> Đầu vào: stack `lab` Day 1 đã apply, `tofu plan` = No changes.

## Kết quả cuối ngày (DoD)

- [ ] Cluster `qltt-prod` (Enhanced) chạy bản **mới nhất − 1 minor**, 4 node pool: `system` 2, `app` 3,
      `obs` 1, `loadgen` 0.
- [ ] Cluster `qltt-staging` (Basic) có 2 node A1 arm64.
- [ ] `kubectl get nodes -L oci.oraclecloud.com/fault-domain` thấy node prod trải đủ 3 FD.
- [ ] Add-on Cluster Autoscaler chạy, quản lý pool `app` (3–5).
- [ ] Xoá pool `obs` bằng Tofu rồi apply lại thành công.
- [ ] 2 context `qltt-prod`, `qltt-staging` trong kubeconfig; API chỉ mở cho `ADMIN_CIDR`.

```text
qltt-prod (ENHANCED, x86)                         qltt-staging (BASIC, arm64)
├─ system  2 × E5.Flex 2/16  taint system         └─ app  2 × A1.Flex 2/12
├─ app     3 × E5.Flex 2/16  autoscale 3–5
├─ obs     1 × E5.Flex 2/32  taint obs
└─ loadgen 0 × E5.Flex 2/16  taint loadgen (Day 7)
```

Nếu Day 0 chọn **phương án B**: `system` 2 × 1 OCPU/12 GB (không taint, gộp `obs`), `app` 2 × 1/12,
bỏ `obs` và `loadgen`.

---

## 1. Chọn phiên bản và image

```bash
source ~/.qltt-lab.env
oci ce cluster-options get --cluster-option-id all --region "$OCI_REGION" \
  --query 'data."kubernetes-versions"' --output json
```

Ví dụ trả về `[..., "v1.33.1", "v1.34.1"]` thì `K8S_VERSION_START=v1.33.1`, `K8S_VERSION_TARGET=v1.34.1`.
Ghi vào bảng README §5.

Liệt kê image node cho phiên bản đã chọn (tạm dùng `all`, sau khi có cluster có thể dùng cluster ID):

```bash
V=${K8S_VERSION_START#v}
oci ce node-pool-options get --node-pool-option-id all --compartment-id "$COMPARTMENT_OCID" \
  --query "data.sources[?contains(\"source-name\", 'OKE-$V')].\"source-name\"" --output json \
  | jq -r '.[]' | sort
```

Chọn:

- x86: tên dạng `Oracle-Linux-8.10-2026.xx.xx-0-OKE-1.33.1-NNNN` (không có `aarch64`, không có `GPU`).
- arm: tên dạng `Oracle-Linux-8.10-aarch64-2026.xx.xx-0-OKE-1.33.1-NNNN`.

**Pin tên image** vào biến thay vì regex "mới nhất". Nếu để regex, khi Oracle ra image mới, `plan`
sẽ đổi `image_id` và node cycling sẽ thay toàn bộ node ngoài ý muốn.

---

## 2. Module `oke-cluster`

```hcl
# infra/oci/modules/oke-cluster/main.tf
variable "compartment_id" { type = string }
variable "name" { type = string }
variable "kubernetes_version" { type = string }
variable "enhanced" { type = bool }
variable "vcn_id" { type = string }
variable "api_subnet_id" { type = string }
variable "api_nsg_id" { type = string }
variable "lb_subnet_id" { type = string }
variable "services_cidr" { type = string }
variable "tags" { type = map(string) }

resource "oci_containerengine_cluster" "this" {
  compartment_id     = var.compartment_id
  name               = var.name
  kubernetes_version = var.kubernetes_version
  vcn_id             = var.vcn_id
  type               = var.enhanced ? "ENHANCED_CLUSTER" : "BASIC_CLUSTER"

  cluster_pod_network_options {
    cni_type = "OCI_VCN_IP_NATIVE"
  }

  endpoint_config {
    is_public_ip_enabled = true
    subnet_id            = var.api_subnet_id
    nsg_ids              = [var.api_nsg_id]
  }

  options {
    service_lb_subnet_ids = [var.lb_subnet_id]
    kubernetes_network_config {
      services_cidr = var.services_cidr
    }
    # Tag cho LB và Block Volume do Kubernetes tạo: teardown tìm tài nguyên sót bằng tag này
    service_lb_config {
      freeform_tags = merge(var.tags, { "oke-managed" = "lb", "oke-cluster" = var.name })
    }
    persistent_volume_config {
      freeform_tags = merge(var.tags, { "oke-managed" = "pv", "oke-cluster" = var.name })
    }
  }

  freeform_tags = var.tags
}

output "id" { value = oci_containerengine_cluster.this.id }
output "private_endpoint" { value = oci_containerengine_cluster.this.endpoints[0].private_endpoint }
output "public_endpoint" { value = oci_containerengine_cluster.this.endpoints[0].public_endpoint }
```

`services_cidr` không được trùng VCN: prod `10.96.0.0/16`, staging `10.97.0.0/16`.

---

## 3. Module `node-pool`

```hcl
# infra/oci/modules/node-pool/main.tf
variable "compartment_id" { type = string }
variable "cluster_id" { type = string }
variable "name" { type = string }
variable "kubernetes_version" { type = string }
variable "image_name" { type = string }
variable "shape" { type = string }
variable "ocpus" { type = number }
variable "memory_gbs" { type = number }
variable "size" { type = number }
variable "availability_domain" { type = string }
variable "worker_subnet_id" { type = string }
variable "pod_subnet_id" { type = string }
variable "workers_nsg_id" { type = string }
variable "pods_nsg_id" { type = string }
variable "pool_label" { type = string }
variable "taint" {
  type    = bool
  default = false
}
variable "tags" { type = map(string) }
variable "defined_tags" {
  type    = map(string)
  default = {}
}

data "oci_containerengine_node_pool_option" "opt" {
  node_pool_option_id = var.cluster_id
  compartment_id      = var.compartment_id
}

locals {
  image_id = one([
    for s in data.oci_containerengine_node_pool_option.opt.sources :
    s.image_id if s.source_type == "IMAGE" && s.source_name == var.image_name
  ])
  # OKE không có trường taint cho managed node pool: truyền qua kubelet khi node đăng ký
  cloud_init = <<-EOT
    #!/bin/bash
    curl --fail -H "Authorization: Bearer Oracle" -L0 \
      http://169.254.169.254/opc/v2/instance/metadata/oke_init_script | base64 --decode > /var/run/oke-init.sh
    bash /var/run/oke-init.sh --kubelet-extra-args "--register-with-taints=qltt/pool=${var.pool_label}:NoSchedule"
  EOT
}

resource "oci_containerengine_node_pool" "this" {
  compartment_id     = var.compartment_id
  cluster_id         = var.cluster_id
  name               = var.name
  kubernetes_version = var.kubernetes_version
  node_shape         = var.shape

  node_shape_config {
    ocpus         = var.ocpus
    memory_in_gbs = var.memory_gbs
  }

  node_source_details {
    source_type             = "IMAGE"
    image_id                = local.image_id
    boot_volume_size_in_gbs = 50
  }

  node_config_details {
    size    = var.size
    nsg_ids = [var.workers_nsg_id]

    placement_configs {
      availability_domain = var.availability_domain
      subnet_id           = var.worker_subnet_id
      fault_domains       = ["FAULT-DOMAIN-1", "FAULT-DOMAIN-2", "FAULT-DOMAIN-3"]
    }

    node_pool_pod_network_option_details {
      cni_type          = "OCI_VCN_IP_NATIVE"
      pod_subnet_ids    = [var.pod_subnet_id]
      pod_nsg_ids       = [var.pods_nsg_id]
      max_pods_per_node = 31
    }

    freeform_tags = var.tags
    defined_tags  = var.defined_tags
  }

  initial_node_labels {
    key   = "qltt/pool"
    value = var.pool_label
  }

  node_metadata = var.taint ? { user_data = base64encode(local.cloud_init) } : {}

  # Đổi kubernetes_version/image thì OKE tự thay node lần lượt (Day 8)
  node_pool_cycling_details {
    is_node_cycling_enabled = true
    maximum_surge           = "1"
    maximum_unavailable     = "0"
  }

  node_eviction_node_pool_settings {
    eviction_grace_duration              = "PT20M"
    is_force_delete_after_grace_duration = false
  }

  freeform_tags = var.tags
}

output "id" { value = oci_containerengine_node_pool.this.id }
```

**Pool có autoscaler**: tạo `modules/node-pool-autoscaled` bằng cách copy module trên và thêm vào
resource:

```hcl
  lifecycle {
    ignore_changes = [node_config_details[0].size]
  }
```

`lifecycle` không nhận biến, nên cần 2 module. Không có dòng này, mỗi lần `tofu apply` sẽ kéo số node
về `size` ban đầu, đè lên quyết định của autoscaler.

> Vì sao `max_pods_per_node = 31`: với VCN-native, mỗi pod chiếm 1 IP trên VNIC phụ. Shape Flex 2
> OCPU có 2 VNIC, 1 VNIC dành cho node, mỗi VNIC phụ tối đa 31 IP. Day 7 tăng replica sẽ gặp giới
> hạn này trước cả CPU; `kubectl describe pod` sẽ báo `Too many pods`.

---

## 4. Gọi module trong `envs/lab`

```hcl
# infra/oci/envs/lab/variables.tf (bổ sung)
variable "k8s_version" { type = string }
variable "image_x86" { type = string }
variable "image_arm" { type = string }
variable "loadgen_size" {
  type    = number
  default = 0
}
```

```hcl
# infra/oci/envs/lab/oke.tf
data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

locals {
  ad       = data.oci_identity_availability_domains.ads.availability_domains[0].name
  sn       = module.network.subnet_ids
  nsg      = module.network.nsg_ids
  tag_ns   = local.f.tag_namespace
}

module "prod" {
  source             = "../../modules/oke-cluster"
  compartment_id     = var.compartment_ocid
  name               = "qltt-prod"
  kubernetes_version = var.k8s_version
  enhanced           = true
  vcn_id             = module.network.vcn_id
  api_subnet_id      = local.sn.api
  api_nsg_id         = local.nsg.api
  lb_subnet_id       = local.sn.public
  services_cidr      = "10.96.0.0/16"
  tags               = local.tags
}

module "staging" {
  source             = "../../modules/oke-cluster"
  compartment_id     = var.compartment_ocid
  name               = "qltt-staging"
  kubernetes_version = var.k8s_version
  enhanced           = false
  vcn_id             = module.network.vcn_id
  api_subnet_id      = local.sn.api
  api_nsg_id         = local.nsg.api
  lb_subnet_id       = local.sn.public
  services_cidr      = "10.97.0.0/16"
  tags               = local.tags
}

locals {
  pool_common = {
    compartment_id      = var.compartment_ocid
    kubernetes_version  = var.k8s_version
    availability_domain = local.ad
    worker_subnet_id    = local.sn.workers
    pod_subnet_id       = local.sn.pods
    workers_nsg_id      = local.nsg.workers
    pods_nsg_id         = local.nsg.pods
    tags                = local.tags
  }
  prod_defined_tags    = { "${local.tag_ns}.project" = "qltt-lab", "${local.tag_ns}.cluster" = "prod" }
  staging_defined_tags = { "${local.tag_ns}.project" = "qltt-lab", "${local.tag_ns}.cluster" = "staging" }
}

module "pool_system" {
  source              = "../../modules/node-pool"
  cluster_id          = module.prod.id
  name                = "system"
  pool_label          = "system"
  taint               = true
  image_name          = var.image_x86
  shape               = "VM.Standard.E5.Flex"
  ocpus               = 2
  memory_gbs          = 16
  size                = 2
  defined_tags        = local.prod_defined_tags
  compartment_id      = local.pool_common.compartment_id
  kubernetes_version  = local.pool_common.kubernetes_version
  availability_domain = local.pool_common.availability_domain
  worker_subnet_id    = local.pool_common.worker_subnet_id
  pod_subnet_id       = local.pool_common.pod_subnet_id
  workers_nsg_id      = local.pool_common.workers_nsg_id
  pods_nsg_id         = local.pool_common.pods_nsg_id
  tags                = local.pool_common.tags
}

module "pool_app" {
  source     = "../../modules/node-pool-autoscaled"
  cluster_id = module.prod.id
  name       = "app"
  pool_label = "app"
  taint      = false
  image_name = var.image_x86
  shape      = "VM.Standard.E5.Flex"
  ocpus      = 2
  memory_gbs = 16
  size       = 3
  defined_tags = local.prod_defined_tags
  # ... các tham số chung như pool_system
}

module "pool_obs" {
  source     = "../../modules/node-pool"
  cluster_id = module.prod.id
  name       = "obs"
  pool_label = "obs"
  taint      = true
  image_name = var.image_x86
  shape      = "VM.Standard.E5.Flex"
  ocpus      = 2
  memory_gbs = 32
  size       = 1
  defined_tags = local.prod_defined_tags
  # ... các tham số chung
}

module "pool_loadgen" {
  source     = "../../modules/node-pool"
  cluster_id = module.prod.id
  name       = "loadgen"
  pool_label = "loadgen"
  taint      = true
  image_name = var.image_x86
  shape      = "VM.Standard.E5.Flex"
  ocpus      = 2
  memory_gbs = 16
  size       = var.loadgen_size
  defined_tags = local.prod_defined_tags
  # ... các tham số chung
}

module "pool_staging" {
  source     = "../../modules/node-pool"
  cluster_id = module.staging.id
  name       = "app"
  pool_label = "app"
  taint      = false
  image_name = var.image_arm
  shape      = "VM.Standard.A1.Flex"
  ocpus      = 2
  memory_gbs = 12
  size       = 2
  defined_tags = local.staging_defined_tags
  # ... các tham số chung
}
```

> Tag `qltt.cluster=staging` trên node staging sẽ được dùng ở Day 3: cluster Basic không có Workload
> Identity, ESO ở staging dùng Instance Principal qua dynamic group lọc theo tag này.

`envs/lab/lab.tfvars.example` (commit), bản thật `terraform.tfvars` (không commit):

```hcl
k8s_version = "v1.33.1"
image_x86   = "Oracle-Linux-8.10-2026.xx.xx-0-OKE-1.33.1-NNNN"
image_arm   = "Oracle-Linux-8.10-aarch64-2026.xx.xx-0-OKE-1.33.1-NNNN"
loadgen_size = 0
```

Vì sao không commit `terraform.tfvars`: nó không có secret, nhưng Day 8 sẽ đổi `k8s_version` bằng PR.
Nếu muốn PR thấy được thay đổi, đổi tên thành `lab.auto.tfvars` và **commit**, đồng thời sửa
`.gitignore` (bỏ dòng `*.auto.tfvars`). Hướng dẫn Day 8 giả định bạn làm vậy.

---

## 5. Cluster Autoscaler add-on + policy Workload Identity

```hcl
# infra/oci/envs/lab/addons.tf
resource "oci_containerengine_addon" "autoscaler" {
  cluster_id                       = module.prod.id
  addon_name                       = "ClusterAutoscaler"
  remove_addon_resources_on_delete = true

  configurations {
    key   = "authType"
    value = "workload"
  }
  configurations {
    key   = "nodes"
    value = "3:5:${module.pool_app.id}"
  }
}

locals {
  wi = "request.principal.type='workload', request.principal.cluster_id='${module.prod.id}'"
  c  = "compartment id ${var.compartment_ocid}"
}

resource "oci_identity_policy" "autoscaler" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt-prod-cluster-autoscaler"
  description    = "Workload identity: kube-system/cluster-autoscaler"
  statements = [for verb_res in [
    "manage cluster-node-pools",
    "manage instance-family",
    "use subnets",
    "read virtual-network-family",
    "use vnics",
    "inspect compartments",
  ] : "Allow any-user to ${verb_res} in ${local.c} where ALL {${local.wi}, request.principal.namespace='kube-system', request.principal.service_account='cluster-autoscaler'}"]
}
```

Danh sách tham số khác của add-on (`scaleDownUnneededTime`, `expander`, …) xem bằng:

```bash
oci ce addon-option list --kubernetes-version "$K8S_VERSION_START" --addon-name ClusterAutoscaler \
  --query 'data[0].versions[0].configurations[].{key:key,default:value,desc:description}' --output table
```

---

## 6. Apply

```bash
cd "$LAB_REPO/infra/oci/envs/lab"
tofu plan -out day2.tfplan
tofu apply day2.tfplan          # 15–25 phút
```

Theo dõi trong lúc chờ:

```bash
oci ce work-request list -c "$COMPARTMENT_OCID" --query 'data[].{op:"operation-type",status:status,pct:"percent-complete"}' --output table
```

Nếu node pool báo `LimitExceeded` hoặc `Out of host capacity`, xem mục Lỗi hay gặp. Không để node pool
ở trạng thái retry quá lâu: Tofu chờ theo timeout mặc định (khá dài).

---

## 7. Kubeconfig

```bash
PROD_ID=$(tofu output -raw prod_cluster_id)        # thêm output tương ứng trong envs/lab/outputs.tf
STG_ID=$(tofu output -raw staging_cluster_id)

for pair in "qltt-prod:$PROD_ID" "qltt-staging:$STG_ID"; do
  name=${pair%%:*}; id=${pair#*:}
  oci ce cluster create-kubeconfig --cluster-id "$id" --file ~/.kube/config \
    --region "$OCI_REGION" --token-version 2.0.0 --kube-endpoint PUBLIC_ENDPOINT --overwrite
  kubectl config rename-context "$(kubectl config current-context)" "$name"
done
chmod 600 ~/.kube/config
kubectl config get-contexts
```

Alias tiện dụng (thêm vào `~/.bashrc`):

```bash
alias kp='kubectl --context qltt-prod'
alias ks='kubectl --context qltt-staging'
```

---

## 8. Kiểm tra

```bash
kp get nodes -L qltt/pool,oci.oraclecloud.com/fault-domain,node.kubernetes.io/instance-type
ks get nodes -L qltt/pool,kubernetes.io/arch

# Taint đã gắn đúng
kp get nodes -o custom-columns='NAME:.metadata.name,POOL:.metadata.labels.qltt/pool,TAINTS:.spec.taints[*].key'

# Số pod tối đa mỗi node
kp get nodes -o custom-columns='NAME:.metadata.name,PODS:.status.allocatable.pods'

# Thành phần hệ thống OKE
kp -n kube-system get pods -o wide
kp -n kube-system get deploy cluster-autoscaler
kp -n kube-system logs deploy/cluster-autoscaler --tail=30
```

Kỳ vọng:

| Kiểm tra | Kỳ vọng |
| --- | --- |
| Node prod | 6 node `Ready`, `app` ở 3 FD khác nhau, `system` ở 2 FD khác nhau |
| Taint | `system`, `obs` có `qltt/pool`; `app` không |
| `allocatable.pods` | 31 |
| Autoscaler log | Thấy node group `ocid1.nodepool...` min 3 max 5, không có lỗi `401/404` |
| Staging | 2 node `arm64` |

**Nếu `app` không trải 3 FD** (OKE đặt 2 node cùng FD): ghi vào journal, xoá node lệch bằng
`oci ce node-pool delete-node --node-pool-id ... --node-id ... --is-decrement-size false` để OKE tạo
node thay thế, kiểm tra lại. Không kéo dài quá 30 phút; Day 4 CNPG dùng anti-affinity `required` theo
FD nên cần 3 FD.

### Thử autoscaler nhanh (5 phút)

```bash
kp create deploy scale-probe --image=registry.k8s.io/pause:3.10 --replicas=1
kp set resources deploy scale-probe --requests=cpu=1500m,memory=2Gi
kp scale deploy scale-probe --replicas=12
kp get pods -l app=scale-probe -w          # có pod Pending, 3–6 phút sau node thứ 4 xuất hiện
kp delete deploy scale-probe                # autoscaler scale-down sau ~10 phút
```

---

## 9. DoD: xoá và dựng lại node pool

```bash
cd "$LAB_REPO/infra/oci/envs/lab"
tofu destroy -target=module.pool_obs -auto-approve
kp get nodes -l qltt/pool=obs                  # rỗng
tofu apply -auto-approve
kp get nodes -l qltt/pool=obs                  # 1 node Ready
tofu plan -detailed-exitcode; echo "exit=$?"   # 0
```

`-target` chỉ dùng cho bài tập này. Ghi chú trong journal: không dùng `-target` cho vận hành thường
ngày vì dễ làm state lệch với code.

## 10. Stretch: API endpoint private

1. Đặt `is_public_ip_enabled = false` cho cluster prod.
2. Tạo `oci_bastion_bastion` (Day 1 stretch) và session port-forwarding tới
   `<private_endpoint>:6443`.
3. Kubeconfig dùng `--kube-endpoint PRIVATE_ENDPOINT`, sửa `server:` thành `https://127.0.0.1:6443`
   và thêm `tls-server-name: <private IP>`.

Đánh đổi: an toàn hơn, nhưng mỗi phiên bastion hết hạn sau tối đa 3 giờ. Với 10 ngày, public endpoint +
allowlist IP là hợp lý; ghi rõ trong báo cáo.

## Lỗi hay gặp

| Triệu chứng | Nguyên nhân | Xử lý |
| --- | --- | --- |
| Node pool `LimitExceeded` | Hết limit E5 core | Giảm `ocpus`/số node theo phương án B, hoặc chờ yêu cầu tăng limit |
| A1 `Out of host capacity` | Hết capacity ARM ở Kulai | Thử lại sau vài giờ; hoặc staging dùng `VM.Standard.E5.Flex` 1/8 × 2 và `image_x86` |
| Node tạo xong nhưng không `Ready` / không join | NSG thiếu 6443/12250 từ workers tới API | Kiểm tra rule `api` INGRESS; `oci ce node-pool get` xem `node-error` |
| Pod `ContainerCreating` mãi, event `failed to assign IP` | NSG `pods` hoặc subnet pod hết IP; route private thiếu SGW | Kiểm tra route table private có Service Gateway |
| `local.image_id` là `null` | Tên image không khớp chính xác | Chạy lại lệnh liệt kê ở mục 1 với cluster ID thật |
| Autoscaler log `401 NotAuthenticated` | Policy workload identity chưa propagate hoặc sai service account | Chờ 2–3 phút; kiểm tra `kp -n kube-system get sa cluster-autoscaler` |
| `kubectl` timeout | IP nhà đổi, `ADMIN_CIDR` cũ | `source ~/.qltt-lab.env && tofu apply` |
| `tofu destroy` pool treo lâu | Node còn pod với PDB chặn drain | Bình thường sau Day 4; `eviction_grace_duration` 20 phút rồi mới xoá |

## Commit cuối ngày

```bash
git add infra/oci
git commit -m "feat(oci-lab): OKE prod/staging clusters, node pools, autoscaler add-on"
```
