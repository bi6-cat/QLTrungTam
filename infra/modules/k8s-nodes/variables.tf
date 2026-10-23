variable "name" {
  type = string
}

variable "zone" {
  type = string
}

variable "subnet_id" {
  type = string
}

variable "nodes" {
  type = map(object({
    role         = string # control-plane | worker
    machine_type = string
    spot         = optional(bool, false)
  }))
}

variable "network_name" {
  type = string
}