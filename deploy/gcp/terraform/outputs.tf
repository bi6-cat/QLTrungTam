output "external_ip" {
  description = "Trỏ A record aplus trên Cloudflare vào IP này lúc cutover."
  value       = google_compute_address.app.address
}

output "pgbackrest_bucket" {
  value = google_storage_bucket.pgbackrest.name
}

output "vm_service_account" {
  value = google_service_account.vm.email
}

output "ssh" {
  value = "gcloud compute ssh ${google_compute_instance.app.name} --zone ${var.zone} --project ${var.project_id} --tunnel-through-iap"
}
