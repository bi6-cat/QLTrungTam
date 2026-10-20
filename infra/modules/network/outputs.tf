output "network_name" {
  value = google_compute_network.vpc.name
}

output "subnet_ids" {
  value = { for k, s in google_compute_subnetwork.this : k => s.id }
}
