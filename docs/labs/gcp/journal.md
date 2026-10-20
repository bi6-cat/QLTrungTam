# Journal

Mỗi buổi 3–5 dòng: làm gì, đang dừng ở đâu, chi phí. Đầu buổi đọc dòng cuối cùng để biết làm tiếp từ đâu.

## 2026-10-19 · M0
- Máy công ty (Ubuntu 24.04 x86_64). Tách môi trường lab trong `.env.gcp`: `CLOUDSDK_CONFIG`, `KUBECONFIG`, project/region/zone.
- Tool đã có; thiếu `tflint`, `k6`, `gh` thì cài đúng lúc cần.
- Budget $150 (50/90/100%) đã tạo.
- Quota thật: `CPUS_ALL_REGIONS=12`, `CPUS`(asia-southeast1)=32, `INSTANCES`=8, `IN_USE_ADDRESSES`=4, `PREEMPTIBLE_CPUS`=0
  (nhiều khả năng spot dùng quota `CPUS`, kiểm lại ở M3). Chốt phương án A: 3 cp e2-medium + 2 worker e2-standard-2 ≈ 10 vCPU.
- Chưa nâng lên Paid (chưa bị chặn quota).
- Xong 0.6: bật 42 API, bucket `tfstate` + `backup` (versioning), Cloud DNS zone `gcp-zett`, Artifact Registry `qltt`.
- Xong 0.7: NS cho `gcp` trên Cloudflare đã trỏ về 4 name server `ns-cloud-e1..e4.googledomains.com`, `dig` xác nhận.
- Dừng ở: hết M0, bước tiếp theo là M1 (Terraform cơ bản). Chi phí: ~$0.

## 2026-10-20 · M1
- Xong M1: vòng đời `init/plan/apply/destroy`, biến/output/tfvars, state lên GCS, `import` firewall và xử lý drift, `modules/network` + root `lab/`, `fmt` + `tflint`.
- Đã `apply` VPC `qltt` + 3 subnet (public/private/k8s) + firewall IAP SSH; giữ lại cho M2 (không tốn tiền). Sandbox đã destroy.
- Dọn repo: xoá phần chỉ phục vụ prod EC2, gom code app vào `app/`; hạ tầng ở `infra/` (`modules/`, `lab/`).
- Dừng ở: hết M1, bước tiếp theo là M2 (mạng đầy đủ + VM legacy + Ansible). Chi phí: ~$0.

## 2026-10-20 · M2
- Xong M2: firewall web/internal, Cloud Router + NAT (`private`, `k8s`) bằng Terraform, `plan` sạch; build và push `qltt-app:v1` lên Artifact Registry.
- Gặp lỗi đăng nhập Docker bản snap (config khác chỗ, `PATH` sandbox); tạm dùng `docker login` bằng token gcloud (hết hạn ~1 giờ).
- Dừng ở: hết M2, bước tiếp theo là M3 (cần outline và kế hoạch chi tiết trước). Chi phí: ~$0; NAT đang chạy, xem mục dọn dẹp.
