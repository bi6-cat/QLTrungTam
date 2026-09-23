# infra/oci/envs/foundation/versions.tf
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    oci    = { source = "oracle/oci", version = "~> 9.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
    tls    = { source = "hashicorp/tls", version = "~> 4.0" }
  }

  backend "s3" {
    bucket                      = "qltt-tfstate"
    key                         = "foundation/terraform.tfstate"
    region                      = "ap-kulai-2"
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
    # endpoints truyền qua backend.hcl vì chứa namespace
  }

  encryption {
    key_provider "pbkdf2" "main" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "main" {
      keys = key_provider.pbkdf2.main
    }
    state {
      method   = method.aes_gcm.main
      enforced = true
    }
    plan {
      method   = method.aes_gcm.main
      enforced = true
    }
  }
}
