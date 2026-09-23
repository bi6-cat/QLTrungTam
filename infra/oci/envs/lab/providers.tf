provider "oci" {
  region              = var.region
  config_file_profile = var.oci_profile
}

provider "oci" {
  alias               = "home"
  region              = var.home_region
  config_file_profile = var.oci_profile
}
