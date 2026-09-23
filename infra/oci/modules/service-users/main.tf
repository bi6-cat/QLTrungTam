variable "tenancy_id" { type = string }
variable "compartment_id" { type = string }
variable "email_domain" { type = string } # identity domain bắt buộc email cho user

terraform {
  required_providers {
    oci = { source = "oracle/oci", configuration_aliases = [oci.home] }
    tls = { source = "hashicorp/tls" }
  }
}

locals {
  c = "compartment id ${var.compartment_id}"
}

# ---- cluster ----
resource "oci_identity_group" "cluster" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-cluster-svc"
  description    = "QLTT lab: workloads in OKE"
}

resource "oci_identity_user" "cluster" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "svc-qltt-cluster"
  description    = "QLTT lab: S3-compat + OCIR pull"
  email          = "svc-qltt-cluster@${var.email_domain}"
}

resource "oci_identity_user_group_membership" "cluster" {
  provider = oci.home
  group_id = oci_identity_group.cluster.id
  user_id  = oci_identity_user.cluster.id
}

resource "oci_identity_customer_secret_key" "cluster" {
  provider     = oci.home
  user_id      = oci_identity_user.cluster.id
  display_name = "cluster-s3"
}

resource "oci_identity_auth_token" "cluster" {
  provider    = oci.home
  user_id     = oci_identity_user.cluster.id
  description = "ocir-pull"
}

resource "oci_identity_policy" "cluster" {
  provider       = oci.home
  compartment_id = var.compartment_id
  name           = "qltt-cluster-svc"
  description    = "QLTT lab: cluster service user"
  statements = [
    "Allow group 'Default'/'qltt-cluster-svc' to read repos in ${local.c}",
    "Allow group 'Default'/'qltt-cluster-svc' to read buckets in ${local.c}",
    "Allow group 'Default'/'qltt-cluster-svc' to manage objects in ${local.c} where any {target.bucket.name='qltt-cnpg-backup', target.bucket.name='qltt-loki', target.bucket.name='qltt-tempo'}",
  ]
}

# ---- CI ----
resource "oci_identity_group" "ci" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-ci"
  description    = "QLTT lab: GitHub Actions"
}

resource "oci_identity_user" "ci" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "svc-qltt-ci"
  description    = "QLTT lab: tofu plan + OCIR push"
  email          = "svc-qltt-ci@${var.email_domain}"
}

resource "oci_identity_user_group_membership" "ci" {
  provider = oci.home
  group_id = oci_identity_group.ci.id
  user_id  = oci_identity_user.ci.id
}

resource "tls_private_key" "ci" {
  algorithm = "RSA"
  rsa_bits  = 2048
}

resource "oci_identity_api_key" "ci" {
  provider  = oci.home
  user_id   = oci_identity_user.ci.id
  key_value = tls_private_key.ci.public_key_pem
}

resource "oci_identity_customer_secret_key" "ci" {
  provider     = oci.home
  user_id      = oci_identity_user.ci.id
  display_name = "ci-tfstate"
}

resource "oci_identity_auth_token" "ci" {
  provider    = oci.home
  user_id     = oci_identity_user.ci.id
  description = "ocir-push"
}

# "read all-resources" chỉ gắn được ở root compartment
resource "oci_identity_policy" "ci_tenancy" {
  provider       = oci.home
  compartment_id = var.tenancy_id
  name           = "qltt-ci-read"
  description    = "QLTT lab: CI plan refresh"
  statements = [
    "Allow group 'Default'/'qltt-ci' to read all-resources in tenancy",
  ]
}

resource "oci_identity_policy" "ci_compartment" {
  provider       = oci.home
  compartment_id = var.compartment_id
  name           = "qltt-ci-write"
  description    = "QLTT lab: CI state lock + OCIR push"
  statements = [
    "Allow group 'Default'/'qltt-ci' to manage objects in ${local.c} where target.bucket.name='qltt-tfstate'",
    "Allow group 'Default'/'qltt-ci' to manage repos in ${local.c}",
  ]
}

output "cluster_s3_access_key_id" { value = oci_identity_customer_secret_key.cluster.id }

output "cluster_s3_secret_key" {
  value     = oci_identity_customer_secret_key.cluster.key
  sensitive = true
}

output "cluster_ocir_username" { value = oci_identity_user.cluster.name }

output "cluster_ocir_token" {
  value     = oci_identity_auth_token.cluster.token
  sensitive = true
}

output "ci" {
  sensitive = true
  value = {
    user_ocid       = oci_identity_user.ci.id
    fingerprint     = oci_identity_api_key.ci.fingerprint
    private_key_pem = tls_private_key.ci.private_key_pem
    s3_access_key   = oci_identity_customer_secret_key.ci.id
    s3_secret_key   = oci_identity_customer_secret_key.ci.key
    ocir_username   = oci_identity_user.ci.name
    ocir_token      = oci_identity_auth_token.ci.token
  }
}
