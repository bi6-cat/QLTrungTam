# M1 · Terraform cơ bản

Ngày làm: 2026-10-20. Chi phí: ~$0.

## Đã làm
1. Đăng nhập ADC cho Terraform, cài tflint.
2. Một bucket: `init` → `plan` → `apply` → `plan` lần 2 (`No changes`) → `destroy`.
3. Tách biến, output, `terraform.tfvars` (đã gitignore). Thử `-var region=...` thấy `forces replacement`.
4. Chuyển state lên backend `gcs` (bucket `...-tfstate`, prefix theo stack): `terraform init -migrate-state`.
5. Tạo tay firewall trên Console, viết `resource` khớp rồi `terraform import`. Sửa tay port trên Console để gây drift, `plan` hiện `~ update in-place`, `apply` kéo về đúng code.
6. Tách `infra/modules/network` (VPC, subnet bằng `for_each`, firewall IAP SSH) và root `infra/lab` (backend, provider, gọi module, output). Chạy `fmt`, `validate`, `tflint`, `apply`.

## Lệnh quan trọng
```bash
terraform init -migrate-state
terraform import <địa chỉ> projects/<project>/global/firewalls/<tên>
terraform state list
terraform -chdir=lab plan
tflint --init && tflint --recursive
```

## Lỗi gặp và cách sửa
| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| tflint cài bằng script bị `404` | URL script sai | Tải bản release từ GitHub rồi `install` vào `/usr/local/bin` |
| `could not find default credentials` | Provider Go không đọc `CLOUDSDK_CONFIG`, chỉ đọc `GOOGLE_APPLICATION_CREDENTIALS` hoặc đường dẫn mặc định | Đặt `GOOGLE_APPLICATION_CREDENTIALS` trong `.env.gcp` trỏ đúng file ADC |
| `open ...qltt-lab.json: no such file` | Biến trỏ sai tên file | Sửa cho đúng tên `application_default_credentials.json` |
| `Backend initialization required` | Thêm `backend` nhưng chưa `init` lại | `terraform init -migrate-state` |
| `Reference to undeclared resource` ở output root | Viết `network.name` thiếu tiền tố `module.` | `module.network.network_name` |
| `terraform output` báo `No outputs found` | Output của module không tự lộ ra ở root | Khai báo lại `output` trong `lab/outputs.tf` |

## Kết quả
- `plan` báo `No changes`; state nằm ở `gs://...-tfstate/lab/network/default.tfstate`.
- VPC `qltt`, subnet `10.10.0.0/24` (public), `10.10.1.0/24` (private), `10.10.2.0/24` (k8s), firewall `qltt-allow-iap-ssh`.

## Câu hỏi phỏng vấn
- State để ở đâu, khoá thế nào? → backend `gcs`; khoá bằng object `default.tflock` trong prefix; versioning bucket để quay lại bản cũ.
- Có người sửa tay trên Console (drift) thì xử lý sao? → `plan` phát hiện; `apply` kéo về code, hoặc sửa code cho khớp; phòng bằng IAM và PR.
- `count` khác `for_each` thế nào? → `count` theo vị trí, xoá giữa danh sách làm các phần tử sau bị đánh số lại; `for_each` theo key nên ổn định.
- Module và root module khác nhau thế nào? → module là thư mục `.tf`; root là module mà ta chạy lệnh trực tiếp, chứa provider, backend, giá trị.
- `terraform import` để làm gì? → đưa tài nguyên có sẵn vào state, phải tự viết `resource` khớp.
- Terraform xác thực GCP bằng gì? → ADC; CI dùng Workload Identity Federation (M6).

Chi tiết các khái niệm xem [hoi-dap.md](hoi-dap.md).
