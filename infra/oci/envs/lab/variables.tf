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
variable "compartment_ocid" { type = string }
variable "admin_cidr" { type = string }
variable "s3_endpoint" { type = string }
variable "k8s_version" { type = string }
variable "image_x86" { type = string }
variable "loadgen_size" {
  type    = number
  default = 0
}
