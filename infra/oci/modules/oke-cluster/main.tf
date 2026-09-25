terraform {
  required_version = ">= 1.10.0"
  required_providers {
    oci = { source = "oracle/oci", version = "~> 9.0" }
  }
}

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
