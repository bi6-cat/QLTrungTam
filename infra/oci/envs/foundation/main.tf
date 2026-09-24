data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.tenancy_ocid
}

locals {
  tags = { project = "qltt-lab", "managed-by" = "opentofu", stack = "foundation" }
}

# ---- Tag cost-tracking (dùng ở stack lab, không dùng trong chính stack này) ----
resource "oci_identity_tag_namespace" "qltt" {
  provider       = oci.home
  compartment_id = var.compartment_ocid
  name           = "qltt"
  description    = "QLTT lab"
}

resource "oci_identity_tag" "project" {
  provider         = oci.home
  tag_namespace_id = oci_identity_tag_namespace.qltt.id
  name             = "project"
  description      = "Cost tracking"
  is_cost_tracking = true
}

resource "oci_identity_tag" "cluster" {
  provider         = oci.home
  tag_namespace_id = oci_identity_tag_namespace.qltt.id
  name             = "cluster"
  description      = "prod | staging | meta"
}

# ---- OCIR ----
resource "oci_artifacts_container_repository" "repos" {
  for_each       = toset(["qltrungtam", "qltrungtam-migrate"])
  compartment_id = var.compartment_ocid
  display_name   = each.key
  is_public      = false
  freeform_tags  = local.tags
}

# ---- Bucket backup DB: sống lâu hơn cluster ----
resource "oci_objectstorage_bucket" "cnpg_backup" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "qltt-cnpg-backup"
  access_type    = "NoPublicAccess"
  freeform_tags  = local.tags
  lifecycle {
    prevent_destroy = true # Day 7 teardown cuối mới gỡ dòng này
  }
}

module "service_users" {
  source         = "../../modules/service-users"
  providers      = { oci.home = oci.home }
  tenancy_id     = var.tenancy_ocid
  compartment_id = var.compartment_ocid
  email_domain   = var.svc_email_domain
}

# ---- Secret sinh ngẫu nhiên ----
resource "random_password" "p" {
  for_each = {
    "qltt-session-secret-prod"     = 48
    "qltt-session-secret-staging"  = 48
    "qltt-admin-password"          = 20
    "qltt-sepay-webhook-secret"    = 40
    "qltt-db-app-password-prod"    = 32
    "qltt-db-app-password-staging" = 32
    "qltt-grafana-admin-password"  = 24
    "qltt-valkey-password"         = 32
  }
  length  = each.value
  special = false # URL-safe, nhúng thẳng được vào DATABASE_URL/REDIS_URL
}

locals {
  secret_values = merge(
    { for k, v in random_password.p : k => v.result },
    {
      "qltt-cloudflare-api-token" = var.cloudflare_api_token
      "qltt-discord-webhook-url"  = var.discord_webhook_url
      "qltt-s3-access-key-id"     = module.service_users.cluster_s3_access_key_id
      "qltt-s3-secret-access-key" = module.service_users.cluster_s3_secret_key
      "qltt-ocir-dockerconfigjson" = jsonencode({
        auths = {
          "${var.region}.ocir.io" = {
            username = "${data.oci_objectstorage_namespace.ns.namespace}/${module.service_users.cluster_ocir_username}"
            password = module.service_users.cluster_ocir_token
          }
        }
      })
    }
  )

  # Danh sách tên phải khai báo tĩnh, không suy ra từ map sensitive
  secret_names = [
    "qltt-session-secret-prod", "qltt-session-secret-staging", "qltt-admin-password",
    "qltt-sepay-webhook-secret", "qltt-db-app-password-prod", "qltt-db-app-password-staging",
    "qltt-grafana-admin-password", "qltt-valkey-password", "qltt-cloudflare-api-token",
    "qltt-discord-webhook-url", "qltt-s3-access-key-id", "qltt-s3-secret-access-key",
    "qltt-ocir-dockerconfigjson",
  ]
}

module "vault" {
  source         = "../../modules/vault"
  compartment_id = var.compartment_ocid
  secret_names   = local.secret_names
  secret_values  = local.secret_values
  tags           = local.tags
}

module "budget" {
  source             = "../../modules/budget"
  tenancy_id         = var.tenancy_ocid
  amount             = 360
  actual_thresholds  = [60, 120, 180, 250]
  forecast_threshold = 300
  recipients         = var.budget_email
}
