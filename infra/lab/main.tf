terraform {
  required_version = ">= 1.6"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
  backend "gcs" {
    bucket = "project-070733c0-e22c-4fbf-a55-tfstate"
    prefix = "lab/network"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "network" {
  source = "../modules/network"

  name   = "qltt"
  region = var.region
  subnets = {
    public  = { cidr = "10.10.0.0/24" }
    private = { cidr = "10.10.1.0/24" }
    k8s     = { cidr = "10.10.2.0/24" }
  }
}
