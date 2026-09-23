variable "state_passphrase" {
  type      = string
  sensitive = true
}
variable "oci_profile" {
  type    = string
  default = "DEFAULT"
}
variable "region" {
  type    = string
  default = "ap-kulai-2"
}
variable "home_region" { type = string }
variable "tenancy_ocid" { type = string }
variable "compartment_ocid" { type = string }

variable "svc_email_domain" { type = string }
variable "budget_email" { type = string }

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "discord_webhook_url" {
  type      = string
  sensitive = true
}
