resource "google_compute_instance_group" "workers" {
  name      = "${var.name}-workers"
  zone      = var.zone
  instances = var.instances
}

resource "google_compute_region_health_check" "http" {
  name   = "${var.name}-ingress"
  region = var.region

  tcp_health_check {
    port = 80
  }
}

resource "google_compute_region_backend_service" "ingress" {
  name                  = "${var.name}-ingress"
  region                = var.region
  protocol              = "TCP"
  load_balancing_scheme = "EXTERNAL"
  health_checks         = [google_compute_region_health_check.http.id]

  backend {
    group          = google_compute_instance_group.workers.id
    balancing_mode = "CONNECTION"
  }
}

resource "google_compute_address" "ingress" {
  name   = "${var.name}-ingress"
  region = var.region
}

resource "google_compute_forwarding_rule" "ingress" {
  name                  = "${var.name}-ingress"
  region                = var.region
  load_balancing_scheme = "EXTERNAL"
  backend_service       = google_compute_region_backend_service.ingress.id
  ip_address            = google_compute_address.ingress.address
  ip_protocol           = "TCP"
  ports                 = ["80", "443"]
}

resource "google_compute_firewall" "ingress" {
  name          = "${var.name}-allow-ingress"
  network       = var.network_name
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["k8s-worker"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}
