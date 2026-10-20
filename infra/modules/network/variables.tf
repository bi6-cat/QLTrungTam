variable "name" {
  type        = string
  description = "Tên VPC, cũng là tiền tố cho subnet và firewall"
}

variable "region" {
  type = string
}

variable "subnets" {
  type        = map(object({ cidr = string }))
  description = "Key là tên subnet, value chứa dải CIDR"
}

variable "nat_subnets" {
  type        = list(string)
  default     = []
  description = "Key của các subnet được ra Internet qua Cloud NAT"
}