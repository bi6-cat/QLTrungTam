resource "google_compute_network" "vpc" {
  name                    = var.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "this" {
  for_each = var.subnets

  name                     = "${var.name}-${each.key}"
  region                   = var.region
  network                  = google_compute_network.vpc.id
  ip_cidr_range            = each.value.cidr
  private_ip_google_access = true
}

# IAP tunnel dùng dải này để SSH vào VM không có IP public
resource "google_compute_firewall" "allow_iap_ssh" {
  name          = "${var.name}-allow-iap-ssh"
  network       = google_compute_network.vpc.name
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
