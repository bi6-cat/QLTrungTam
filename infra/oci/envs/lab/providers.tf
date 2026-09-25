provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

# IAM (policy, dynamic group) chỉ ghi được ở home region
provider "oci" {
  alias               = "home"
  region              = var.home_region
  config_file_profile = var.oci_profile
}
