terraform {
  required_version = ">= 1.10.0"
  required_providers {
    oci = { source = "oracle/oci", version = "~> 9.0" }
  }
}

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
  vault_type     = "DEFAULT"
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

# for_each chạy trên secret_names (không sensitive); giá trị lấy từ map sensitive.
# keys(var.secret_values) sẽ bị Tofu từ chối vì for_each không nhận nguồn sensitive.
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
