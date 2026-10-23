variable "name" {
  type = string
}

variable "region" {
  type = string
}

variable "zone" {
  type = string
}

variable "instances" {
  type        = list(string)
  description = "self_link của các VM control plane"
}

variable "network_name" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "network_id" {
  type = string
}
