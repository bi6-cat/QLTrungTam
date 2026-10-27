output "network_name" {
  value = module.network.network_name
}

output "subnet_ids" {
  value = module.network.subnet_ids
}

output "ingress_ip" {
  value = module.k8s_ingress_lb.ip
}
