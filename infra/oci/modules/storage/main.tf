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