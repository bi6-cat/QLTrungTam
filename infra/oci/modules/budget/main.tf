terraform {
  required_version = ">= 1.10.0"
  required_providers {
    oci = { source = "oracle/oci", version = "~> 9.0" }
  }
}

variable "tenancy_id" { type = string }
variable "amount" { type = number }
variable "actual_thresholds" { type = list(number) }
variable "forecast_threshold" { type = number }
variable "recipients" { type = string }

resource "oci_budget_budget" "this" {
  compartment_id = var.tenancy_id
  amount         = var.amount
  reset_period   = "MONTHLY"
  target_type    = "COMPARTMENT"
  targets        = [var.tenancy_id] # cả tenancy, bắt cả tài nguyên tạo nhầm chỗ
  display_name   = "qltt-lab"
}

resource "oci_budget_alert_rule" "actual" {
  for_each       = toset([for t in var.actual_thresholds : tostring(t)])
  budget_id      = oci_budget_budget.this.id
  type           = "ACTUAL"
  threshold      = tonumber(each.key)
  threshold_type = "ABSOLUTE"
  recipients     = var.recipients
  display_name   = "actual-${each.key}"
  message        = "QLTT lab: chi phi thuc te vuot $${each.key}"
}

resource "oci_budget_alert_rule" "forecast" {
  budget_id      = oci_budget_budget.this.id
  type           = "FORECAST"
  threshold      = var.forecast_threshold
  threshold_type = "ABSOLUTE"
  recipients     = var.recipients
  display_name   = "forecast-${var.forecast_threshold}"
}
