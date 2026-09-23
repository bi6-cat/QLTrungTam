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
