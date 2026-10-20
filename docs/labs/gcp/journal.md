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
