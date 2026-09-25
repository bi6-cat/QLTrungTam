# Cluster Autoscaler dạng add-on của OKE (chỉ có ở cluster ENHANCED).
# Quản lý pool app 3–4 node: tối đa 4 vì limit E5 13 core (10 core nền + 2 khi scale).
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
    value = "3:4:${module.pool_app.id}"
  }
}

# Workload Identity: cấp quyền cho ServiceAccount kube-system/cluster-autoscaler của cluster prod
# (tương đương IRSA bên EKS: IAM role gắn với ServiceAccount, không dùng key tĩnh)
locals {
  autoscaler_principal = join(", ", [
    "request.principal.type='workload'",
    "request.principal.cluster_id='${module.prod.id}'",
    "request.principal.namespace='kube-system'",
    "request.principal.service_account='cluster-autoscaler'",
  ])
}

resource "oci_identity_policy" "autoscaler" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt-prod-cluster-autoscaler"
  description    = "Workload identity: kube-system/cluster-autoscaler on qltt-prod"
  statements = [for perm in [
    "manage cluster-node-pools",
    "manage instance-family",
    "use subnets",
    "read virtual-network-family",
    "use vnics",
    "inspect compartments",
  ] : "Allow any-user to ${perm} in compartment id ${var.compartment_ocid} where ALL {${local.autoscaler_principal}}"]
  freeform_tags = local.tags
}
