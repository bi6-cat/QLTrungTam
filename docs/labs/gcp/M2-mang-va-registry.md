# M2 · Mạng đầy đủ + Artifact Registry

Ngày làm: 2026-10-20. Chi phí: ~$0 (NAT tính theo giờ, vài cent nếu để chạy qua đêm).

## Đã làm
1. Thêm vào `infra/modules/network`: firewall `allow_web` (80/443, tag `web`), `allow_internal` (`10.10.0.0/16`), Cloud Router + Cloud NAT cho subnet `private` và `k8s`
   (biến `nat_subnets`, khối `dynamic "subnetwork"`). Bỏ `allow_db_from_public`; SSH vào VM đi qua IAP.
2. `plan` báo `4 to add`, `apply`, rồi `plan` lần 2 `No changes`. Kiểm tra bằng `gcloud compute routers nats list` và `gcloud compute firewall-rules list`.
3. Build image `app/Dockerfile`, tag `asia-southeast1-docker.pkg.dev/<project>/qltt/qltt-app:v1`, push lên Artifact Registry.
4. Phân tích cấu trúc image trên registry: 3 digest (index, manifest `linux/amd64`, attestation).

## Lệnh quan trọng
```bash
terraform -chdir=lab fmt -recursive .. && terraform -chdir=lab validate && tflint --recursive
terraform -chdir=lab plan   # mong đợi: 4 to add
terraform -chdir=lab apply
gcloud compute routers nats list --router=qltt-router --region=asia-southeast1
docker build -t asia-southeast1-docker.pkg.dev/<project>/qltt/qltt-app:v1 app/
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin https://asia-southeast1-docker.pkg.dev
docker push asia-southeast1-docker.pkg.dev/<project>/qltt/qltt-app:v1
docker buildx imagetools inspect <image>:v1
gcloud artifacts docker images list asia-southeast1-docker.pkg.dev/<project>/qltt --include-tags
```

## Lỗi gặp và cách sửa
| Lỗi | Nguyên nhân | Sửa |
|---|---|---|
| `docker push`: `Unauthenticated request` | Docker cài bằng snap đọc config ở `~/snap/docker/current/.docker/`, không phải `~/.docker/` | Cấu hình ở đúng thư mục (`DOCKER_CONFIG=...`) |
| `error getting credentials ... docker-credential-gcloud not found in $PATH` | Docker snap chạy sandbox với `PATH` riêng, không thấy helper | Xoá config có `credHelpers`, đăng nhập bằng `gcloud auth print-access-token \| docker login ...` |
| `imagetools inspect`: `401 Unauthorized` | Token đăng nhập thủ công hết hạn (~1 giờ) | Đăng nhập lại |

## Kết quả
- NAT `qltt-nat` (AUTO_ONLY, `LIST_OF_SUBNETWORKS`: `private`, `k8s`). Firewall: `qltt-allow-iap-ssh`, `qltt-allow-internal`, `qltt-allow-web` (target tag `web`).
- Image `qltt-app:v1` có trong repo `qltt`; tag trỏ vào index `46e2dd...`, bên dưới là manifest `linux/amd64` `d3aee7...` và attestation `266ed3...`.

## Câu hỏi phỏng vấn
- Cloud NAT lo chiều nào? → chỉ chiều đi ra; vào phải qua IAP/bastion hoặc load balancer.
- Bỏ một subnet khỏi `nat_subnets` thì `plan` ra gì? → `~ update in-place` (thuộc tính không ForceNew), subnet đó mất đường ra Internet.
- Tag khác digest thế nào, deploy production nên dùng gì? → tag có thể bị ghi đè, digest là hash nội dung bất biến; ghim digest để cluster chạy đúng bản đã kiểm thử.
- Vì sao image chia thành manifest và layer? → content-addressable: chia sẻ và cache layer, multi-arch qua index, tách metadata (attestation, chữ ký) khỏi image.
- Sửa config mà không có tác dụng thì làm gì? → xác định tiến trình thực sự đọc file nào (sandbox snap, biến môi trường), không đoán.
