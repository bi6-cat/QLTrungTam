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
