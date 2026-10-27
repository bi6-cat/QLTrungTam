# Đối chiếu GCP ↔ AWS

Cộng dồn trong lúc làm lab. Dùng cho mục 10.3 của README (bảng GCP ↔ AWS ↔ Azure) và khi phỏng vấn.

| GCP (đã dùng ở) | AWS | Khác biệt đáng nhớ |
| --- | --- | --- |
| Project (M0) | Account | AWS chia nhiều account trong Organizations; GCP chia project trong Folder/Org |
| GCS bucket cho `tfstate` (M1) | S3 (`backend "s3"`) | Khoá state: GCS có sẵn; S3 trước cần DynamoDB, nay có `use_lockfile = true` |
| VPC (M1) | VPC | GCP: VPC global, subnet theo region. AWS: VPC theo region, subnet theo AZ |
| Subnet (M1) | Subnet | AWS muốn HA phải có subnet ở nhiều AZ |
| Firewall rule + `target_tags` (M1–M2) | Security Group (+ NACL) | GCP: rule ở cấp VPC, chọn VM bằng tag. AWS: SG gắn vào instance/ENI. Cả hai stateful |
| Cloud Router + Cloud NAT (M2) | NAT Gateway + route table | NAT GW đặt trong public subnet, cần EIP, mỗi AZ một cái; Cloud NAT là dịch vụ quản lý |
| IAP TCP tunnel (M1) | SSM Session Manager / EC2 Instance Connect Endpoint | Vào máy không IP public mà không cần bastion |
| Compute Engine VM (M3) | EC2 | `machine_type` ↔ `instance_type` (`e2-medium` ~ `t3.medium`) |
| `can_ip_forward = true` (M3) | Tắt Source/Dest Check | Cùng ý nghĩa, ngược chiều cấu hình |
| Instance group + health check + backend service + forwarding rule (M3) | Target group + NLB + listener | GCP tách nhiều resource hơn |
| Dải health check `35.191.0.0/16`, `130.211.0.0/22` (M3) | NLB health check từ IP của NLB trong VPC | AWS: SG cho phép CIDR của VPC |
| Cloud DNS private zone (M3) | Route 53 private hosted zone | Gắn zone vào VPC thì máy trong VPC mới phân giải được |
| Artifact Registry (M0) | ECR | |
| Budget (M0) | AWS Budgets | |
| `gcloud compute ssh --tunnel-through-iap` (M3) | `aws ssm start-session` | gcloud tự tạo và đẩy SSH key lên metadata; SSM không dùng key |
| `ignore_changes = [metadata]` trên VM (M3) | không có chuyện tương tự | GCP lưu SSH key trong metadata nên bị sửa sau khi tạo |
| Calico VXLAN trên VPC (M3) | Amazon VPC CNI | VPC GCP không route IP Pod nên phải bọc VXLAN; VPC CNI cấp IP VPC thật cho Pod |
| Internal passthrough LB: backend gọi VIP bị trả về chính nó (M3) | NLB internal có hành vi hairpin tương tự khi client là target | Tạm trỏ `/etc/hosts` về cp1 lúc join |
| Ansible inventory tĩnh (M3) | plugin `aws_ec2` ↔ `gcp_compute` (dynamic inventory) | Lab dùng tĩnh vì chỉ 5 máy |
| Firewall policy / Cloud NGFW (M3) | Firewall Manager / Network Firewall / WAF | Policy dùng chung nhiều dự án; NGFW lọc sâu; WAF lọc HTTP |
| External passthrough NLB + instance group (M3) | NLB (target type instance) | Không đổi cổng, nên Traefik dùng hostPort |

Sắp gặp: GKE ↔ EKS, Cloud SQL ↔ RDS, Workload Identity Federation ↔ GitHub OIDC + IAM Role, Secret Manager ↔ Secrets Manager.
