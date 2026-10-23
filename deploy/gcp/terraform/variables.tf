variable "project_id" {
  description = "Project prod, tách khỏi project lab."
  type        = string
}

variable "region" {
  type    = string
  default = "asia-southeast1"
}

variable "zone" {
  type    = string
  default = "asia-southeast1-a"
}

variable "machine_type" {
  description = "e2-small = thấy 2 vCPU, baseline 0,5 vCPU (burst lên 2 bằng credit), 2 GB RAM; nhỉnh hơn t3.small (baseline 0,4). Tốn 2 vCPU quota."
  type        = string
  default     = "e2-small"
}

variable "disk_size_gb" {
  description = "Chỉ dùng lúc tạo VM. Đổi sau này thì provider đòi tạo lại VM: resize bằng gcloud trước rồi mới sửa số ở đây."
  type        = number
  default     = 32
}

variable "admin_cidrs" {
  description = "IP được SSH thẳng (dạng x.x.x.x/32). Dải IAP luôn được mở thêm."
  type        = list(string)
}

variable "alert_email" {
  description = "Email nhận cảnh báo uptime."
  type        = string
}

variable "domain" {
  type    = string
  default = "aplus.zett.io.vn"
}

variable "enable_rustdesk" {
  description = "Mở cổng RustDesk 21115-21119/tcp, 21116/udp."
  type        = bool
  default     = true
}
