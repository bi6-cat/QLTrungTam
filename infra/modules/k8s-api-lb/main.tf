resource "google_compute_instance_group" "cp" {
  name      = "${var.name}-cp"
  zone      = var.zone
  instances = var.instances
}

resource "google_compute_health_check" "api" {
  name                = "${var.name}-api"
  check_interval_sec  = 5
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 2

  tcp_health_check {
    port = 6443
  }
}

resource "google_compute_region_backend_service" "api" {
  name                  = "${var.name}-api"
  region                = var.region
  protocol              = "TCP"
  load_balancing_scheme = "INTERNAL"
  health_checks         = [google_compute_health_check.api.id]

  backend {
    group          = google_compute_instance_group.cp.id
    balancing_mode = "CONNECTION"
  }
}

resource "google_compute_address" "api" {
  name         = "${var.name}-api"
  region       = var.region
  subnetwork   = var.subnet_id
  address_type = "INTERNAL"
}

resource "google_compute_forwarding_rule" "api" {
  name                  = "${var.name}-api"
  region                = var.region
  load_balancing_scheme = "INTERNAL"
  backend_service       = google_compute_region_backend_service.api.id
  network               = var.network_name
  subnetwork            = var.subnet_id
  ip_address            = google_compute_address.api.address
  ports                 = ["6443"]
}

resource "google_dns_managed_zone" "internal" {
  name       = "${var.name}-lab-internal"
  dns_name   = "lab.internal."
  visibility = "private"

  private_visibility_config {
    networks {
      network_url = var.network_id
    }
  }
}

resource "google_dns_record_set" "api" {
  name         = "k8s-api.lab.internal."
  managed_zone = google_dns_managed_zone.internal.name
  type         = "A"
  ttl          = 60
  rrdatas      = [google_compute_address.api.address]
}
