resource "google_compute_instance" "node" {
  for_each     = var.nodes
  name         = "${var.name}-${each.key}"
  zone         = var.zone
  machine_type = each.value.machine_type
  tags         = ["k8s", "k8s-${each.value.role}"]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      size  = 30
    }
  }

  network_interface {
    subnetwork = var.subnet_id # không có access_config nên không có IP public
  }

  allow_stopping_for_update = true

  lifecycle {
    ignore_changes = [metadata]
  }
}

resource "google_compute_firewall" "lb_health_check" {
  name          = "${var.name}-allow-lb-health-check"
  network       = var.network_name
  direction     = "INGRESS"
  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["k8s"]

  allow {
    protocol = "tcp"
    ports    = ["6443", "30000-32767"]
  }
}

resource "google_compute_firewall" "nodeport" {
  name          = "${var.name}-allow-nodeport"
  network       = var.network_name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["k8s-worker"]

  allow {
    protocol = "tcp"
    ports    = ["30000-32767"]
  }

}
