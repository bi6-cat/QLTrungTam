variable "compartment_id" { type = string }
variable "name" { type = string }

variable "vcn_cidr" {
  type    = string
  default = "10.60.0.0/16"
}

variable "subnets" {
  type = map(object({ cidr = string, public = bool, dns = string }))
  default = {
    api     = { cidr = "10.60.0.0/28", public = true, dns = "api" }
    public  = { cidr = "10.60.1.0/24", public = true, dns = "pub" }
    workers = { cidr = "10.60.8.0/22", public = false, dns = "workers" }
    pods    = { cidr = "10.60.32.0/19", public = false, dns = "pods" }
  }
}

variable "admin_cidr" { type = string }
variable "envoy_node_ports" {
  type    = list(number)
  default = [30080, 30443]
}
variable "tags" { type = map(string) }
