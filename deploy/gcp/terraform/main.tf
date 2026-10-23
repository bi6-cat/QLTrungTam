locals {
  name = "qltt-prod"

  services = [
    "compute.googleapis.com",
    "iap.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "storage.googleapis.com",
  ]

  # Dải IP của IAP TCP forwarding (gcloud compute ssh --tunnel-through-iap).
  iap_cidr = "35.235.240.0/20"
}

resource "google_project_service" "this" {
  for_each = toset(local.services)

  service            = each.value
  disable_on_destroy = false
}

# ---------- Mạng ----------
# VPC riêng thay cho network "default" (default mở SSH/RDP cho 0.0.0.0/0).

resource "google_compute_network" "prod" {
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false

  depends_on = [google_project_service.this]
}

resource "google_compute_subnetwork" "prod" {
  name          = "${local.name}-${var.region}"
  region        = var.region
  network       = google_compute_network.prod.id
  ip_cidr_range = "10.20.0.0/24"
}

resource "google_compute_firewall" "web" {
  name          = "${local.name}-allow-web"
  network       = google_compute_network.prod.id
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web"]

  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "ssh" {
  name          = "${local.name}-allow-ssh"
  network       = google_compute_network.prod.id
  direction     = "INGRESS"
  source_ranges = concat(var.admin_cidrs, [local.iap_cidr])
  target_tags   = ["ssh"]

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "rustdesk" {
  count = var.enable_rustdesk ? 1 : 0

  name          = "${local.name}-allow-rustdesk"
  network       = google_compute_network.prod.id
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["rustdesk"]

  allow {
    protocol = "tcp"
    ports    = ["21115-21119"]
  }

  allow {
    protocol = "udp"
    ports    = ["21116"]
  }
}

# IP tĩnh: DNS trỏ vào đây, stop/start VM không đổi IP.
resource "google_compute_address" "app" {
  name   = "${local.name}-ip"
  region = var.region

  depends_on = [google_project_service.this]
}

# ---------- Danh tính của VM ----------
# Thay cho IAM Role + IMDSv2 bên EC2: pgBackRest lấy token từ metadata server.

resource "google_service_account" "vm" {
  account_id   = "${local.name}-vm"
  display_name = "QLTrungTam prod VM"
}

resource "google_project_iam_member" "vm" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ])

  project = var.project_id
  role    = each.value
  member  = google_service_account.vm.member
}

# ---------- Backup ----------

resource "google_storage_bucket" "pgbackrest" {
  name                        = "${var.project_id}-pgbackrest"
  location                    = upper(var.region)
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # pgBackRest tự quản retention (2 full + 7 diff). Soft delete giữ bản bị xoá thêm 7 ngày
  # phòng khi xoá nhầm.
  soft_delete_policy {
    retention_duration_seconds = 604800
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.this]
}

# Quyền chỉ trên bucket này, không cấp storage cho cả project (least privilege).
resource "google_storage_bucket_iam_member" "pgbackrest" {
  for_each = toset([
    "roles/storage.objectAdmin",
    "roles/storage.legacyBucketReader",
  ])

  bucket = google_storage_bucket.pgbackrest.name
  role   = each.value
  member = google_service_account.vm.member
}

# ---------- VM ----------

resource "google_compute_instance" "app" {
  name         = local.name
  zone         = var.zone
  machine_type = var.machine_type
  tags         = concat(["web", "ssh"], var.enable_rustdesk ? ["rustdesk"] : [])

  deletion_protection       = true
  allow_stopping_for_update = true

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2404-lts-amd64"
      # Tăng disk: gcloud compute disks resize + growpart/resize2fs, rồi mới sửa disk_size_gb.
      size = var.disk_size_gb
      type = "pd-balanced"
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.prod.id

    access_config {
      nat_ip = google_compute_address.app.address
    }
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  lifecycle {
    # Image family trỏ tới bản mới hơn theo thời gian; không được để plan đòi tạo lại VM prod.
    ignore_changes = [boot_disk[0].initialize_params[0].image]
  }
}

# Snapshot disk hằng ngày 01:00 giờ VN (18:00 UTC), trước giờ pgBackRest 02:00. Giữ 7 ngày.
resource "google_compute_resource_policy" "daily_snapshot" {
  name   = "${local.name}-daily-snapshot"
  region = var.region

  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "18:00"
      }
    }

    retention_policy {
      max_retention_days    = 7
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }

    snapshot_properties {
      storage_locations = [var.region]
    }
  }

  depends_on = [google_project_service.this]
}

resource "google_compute_disk_resource_policy_attachment" "boot" {
  name = google_compute_resource_policy.daily_snapshot.name
  disk = google_compute_instance.app.name
  zone = var.zone
}

# ---------- Giám sát ----------
# Thay cho stack Prometheus/WireGuard đã ngừng: uptime check từ nhiều region của Google.

resource "google_monitoring_notification_channel" "email" {
  display_name = "QLTrungTam alert email"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.this]
}

resource "google_monitoring_uptime_check_config" "health" {
  display_name = "${var.domain} /api/health"
  timeout      = "10s"
  period       = "60s"
  checker_type = "STATIC_IP_CHECKERS"

  http_check {
    path         = "/api/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true

    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.domain
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  display_name          = "${var.domain} down"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Uptime check thất bại từ hơn 1 region"

    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.health.uptime_check_id}\" AND resource.type=\"uptime_url\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "120s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }

      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }
}
