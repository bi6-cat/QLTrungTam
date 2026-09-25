terraform {
  required_version = ">= 1.10.0"
  required_providers {
    oci = { source = "oracle/oci", version = "~> 9.0" }
  }
}

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
