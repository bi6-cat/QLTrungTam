data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

locals {
  ad     = data.oci_identity_availability_domains.ads.availability_domains[0].name
  sn     = module.network.subnet_ids
  nsg    = module.network.nsg_ids
  tag_ns = local.f.tag_namespace
}

# ---------- Cluster ----------
# Không có staging: A1 OUT_OF_HOST_CAPACITY ở Kulai (2026-09-25) và limit E5 chỉ 13 core.
# Thêm lại staging = 1 block module "staging" + 1 dòng trong cluster_ids/pools.

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

# ---------- Node pools ----------

locals {
  cluster_ids = {
    prod = module.prod.id
  }

  # Pool không autoscale: 1 dòng = 1 pool. E5: 2×1 + 1×2 + loadgen = 4 core
  pools = {
    system  = { cluster = "prod", label = "system", shape = "VM.Standard.E5.Flex", ocpus = 1, memory = 16, size = 2, taint = true, image = var.image_x86 }
    obs     = { cluster = "prod", label = "obs", shape = "VM.Standard.E5.Flex", ocpus = 2, memory = 32, size = 1, taint = true, image = var.image_x86 }
    loadgen = { cluster = "prod", label = "loadgen", shape = "VM.Standard.E5.Flex", ocpus = 2, memory = 16, size = var.loadgen_size, taint = true, image = var.image_x86 }
  }
}

module "pool" {
  source   = "../../modules/node-pool"
  for_each = local.pools

  cluster_id          = local.cluster_ids[each.value.cluster]
  name                = each.value.label
  pool_label          = each.value.label
  taint               = each.value.taint
  image_name          = each.value.image
  shape               = each.value.shape
  ocpus               = each.value.ocpus
  memory_gbs          = each.value.memory
  size                = each.value.size
  compartment_id      = var.compartment_ocid
  kubernetes_version  = var.k8s_version
  availability_domain = local.ad
  worker_subnet_id    = local.sn.workers
  pod_subnet_id       = local.sn.pods
  workers_nsg_id      = local.nsg.workers
  pods_nsg_id         = local.nsg.pods
  tags                = local.tags
  defined_tags = {
    "${local.tag_ns}.project" = "qltt-lab"
    "${local.tag_ns}.cluster" = each.value.cluster
  }
}

# Pool app có autoscaler (3–4 node, 6–8 core) → module riêng (lifecycle ignore size)
module "pool_app" {
  source              = "../../modules/node-pool-autoscaled"
  cluster_id          = module.prod.id
  name                = "app"
  pool_label          = "app"
  taint               = false
  image_name          = var.image_x86
  shape               = "VM.Standard.E5.Flex"
  ocpus               = 2
  memory_gbs          = 16
  size                = 3
  compartment_id      = var.compartment_ocid
  kubernetes_version  = var.k8s_version
  availability_domain = local.ad
  worker_subnet_id    = local.sn.workers
  pod_subnet_id       = local.sn.pods
  workers_nsg_id      = local.nsg.workers
  pods_nsg_id         = local.nsg.pods
  tags                = local.tags
  defined_tags = {
    "${local.tag_ns}.project" = "qltt-lab"
    "${local.tag_ns}.cluster" = "prod"
  }
}
