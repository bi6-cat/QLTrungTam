# Hỏi đáp để ôn

Những khái niệm bạn chưa biết và đã hỏi trong lúc làm lab. Mỗi mục: câu hỏi, trả lời ngắn,
rồi cách nói khi bị hỏi phỏng vấn. Thêm mục mới ở cuối, ghi rõ làm ở milestone nào.

## M0

### Máy chạy lệnh (control machine) dùng để làm gì?
- Là máy từ đó mình điều khiển mọi thứ trên cloud: `terraform`, `gcloud`, `ansible`, `kubectl`, `helm`, `docker build`, `k6`.
- Không phải node của cluster.
- Trên máy này có: đăng nhập gcloud, kubeconfig, khóa SSH, `.env.gcp`, `terraform.tfvars`. Không commit các thứ này.
- Terraform cần thêm một lần đăng nhập riêng: `gcloud auth application-default login` (ADC).
- Máy Linux x86_64 thì build image không cần `--platform linux/amd64`; Mac Apple Silicon (arm64) thì cần, vì node GCP chạy amd64.
- Phỏng vấn: "Bạn quản trị hạ tầng từ đâu?" → từ một máy/runner có quyền, credential không nằm trong git. Ở môi trường thật là CI runner hoặc bastion.

### Bastion (jump host) là gì, và IAP tunnel khác gì?
- Bastion là VM nhỏ ở rìa mạng, có IP public, là cửa SSH duy nhất vào các VM private.
  Lợi ích: ít máy lộ ra Internet, có một điểm để kiểm soát và ghi log.
- **IAP tunnel** của GCP làm cùng việc mà không cần VM: `gcloud compute ssh <vm> --tunnel-through-iap`.
  Google kiểm tra danh tính và quyền IAM rồi mới mở đường vào. Cần firewall cho phép dải `35.235.240.0/20` vào cổng 22.
- Trong lab dùng IAP cho đỡ tốn tiền. Bastion để tùy chọn (e2-micro + `ProxyJump`).
- Phỏng vấn: "Máy trong subnet private bạn vào bằng cách nào?" → bastion hoặc IAP, không mở SSH ra Internet.

### Cloud NAT chỉ lo chiều nào?
- Chỉ chiều **đi ra** Internet (để `apt update`, kéo image). Không cho ai từ ngoài đi vào.
- Vì vậy VM private vẫn cập nhật được mà không cần IP public. Chiều vào phải qua IAP hoặc bastion.

### Budget trên GCP có tự dừng chi tiêu không?
- Không. Budget chỉ gửi cảnh báo qua email. Muốn dừng thật phải tự stop/destroy, hoặc tự viết automation cắt billing.
- Vì vậy lab có nhịp cuối buổi: stop VM hoặc `terraform destroy`, rồi liệt kê lại tài nguyên còn sót.

### Free Trial và Paid khác nhau thế nào, có nên nâng?
- Free Trial: có $300 credit, quota thấp. Khi credit hết hoặc hết hạn, tài nguyên bị dừng và **không** bị tính tiền thật.
- Paid: credit còn lại vẫn dùng được đến hạn, quota dễ xin tăng, nhưng hết credit là **tính tiền vào thẻ**.
- Budget chỉ cảnh báo, không chặn chi tiêu. Vì vậy chỉ nâng khi thật sự bị chặn quota, và khi đó phải kiểm tra tài nguyên còn sót mỗi cuối buổi.

### Đọc quota vCPU thế nào?
- `CPUS_ALL_REGIONS` (cấp project) là tổng vCPU **đang chạy** trên mọi region; `CPUS` là hạn mức của một region. Hạn nào thấp hơn thì hạn đó quyết định.
- VM đã stop không chiếm quota vCPU nhưng vẫn chiếm quota `INSTANCES`, disk và địa chỉ IP tĩnh.
- Lab này: 12 vCPU toàn project, nên cluster kubeadm (≈10 vCPU) và GKE (4 vCPU) không chạy cùng lúc.
- Phỏng vấn: "Hết quota thì làm gì?" → xem quota hiện tại, xin tăng qua Console (IAM & Admin → Quotas), hoặc giảm size/bớt node.

## M1

### Terraform xác thực với GCP bằng gì (ADC)?
- `gcloud auth login` chỉ dành cho lệnh `gcloud`. Terraform dùng **ADC** (Application Default Credentials), tạo bằng `gcloud auth application-default login`.
- Thư viện Google (Go, Python...) tìm ADC theo thứ tự: biến `GOOGLE_APPLICATION_CREDENTIALS`, rồi `~/.config/gcloud/application_default_credentials.json`.
- `CLOUDSDK_CONFIG` chỉ có tác dụng với `gcloud`, không có tác dụng với provider Terraform. Khi tách môi trường lab nên đặt thêm `GOOGLE_APPLICATION_CREDENTIALS` trỏ đúng file.
- Lỗi gặp: đặt sai tên file trong biến này → `open ...: no such file or directory`.
- Phỏng vấn: "CI chạy Terraform xác thực thế nào?" → không dùng key JSON dài hạn mà dùng Workload Identity Federation (M6); trên máy cá nhân dùng ADC.

### `terraform plan` lần 2 ngay sau `apply` in gì?
- `No changes`. Terraform so code, state và hạ tầng thật; giống nhau thì không làm gì (tính idempotent).
- Nếu có thay đổi tức là có drift (ai đó sửa tay) hoặc code đã đổi.
