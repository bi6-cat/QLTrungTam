variable "name" { type = string }
variable "region" { type = string }
variable "zone" { type = string }
variable "network_name" { type = string }
variable "instances" {
  type        = list(string)
  description = "self_link của các VM worker"
}
