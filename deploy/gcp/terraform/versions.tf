terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.50"
    }
  }

  # Bucket state tạo tay (state không tự quản lý được chính nó):
  #   terraform init -backend-config="bucket=<PROJECT_ID>-tfstate"
  backend "gcs" {
    prefix = "prod"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone

  default_labels = {
    project    = "qltt"
    env        = "prod"
    managed-by = "terraform"
  }
}
