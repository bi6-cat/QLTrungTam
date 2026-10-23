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
  nat_subnets = ["private", "k8s"]

}

module "k8s_nodes" {
  source = "../modules/k8s-nodes"

  name         = "k8s"
  zone         = "${var.region}-b"
  subnet_id    = module.network.subnet_ids["k8s"]
  network_name = module.network.network_name


  nodes = {
    cp1 = { role = "control-plane", machine_type = "e2-medium" }
    cp2 = { role = "control-plane", machine_type = "e2-medium" }
    cp3 = { role = "control-plane", machine_type = "e2-medium" }
    w1  = { role = "worker", machine_type = "t2d-standard-2" }
    w2  = { role = "worker", machine_type = "t2d-standard-2" }
  }
}

module "k8s_api_lb" {
  source = "../modules/k8s-api-lb"

  name      = "k8s"
  region    = var.region
  zone      = "${var.region}-b"
  instances = module.k8s_nodes.control_plane_self_links

  network_name = module.network.network_name
  subnet_id    = module.network.subnet_ids["k8s"]
  network_id   = module.network.network_id
}

