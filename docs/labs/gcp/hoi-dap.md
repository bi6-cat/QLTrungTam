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

### State là gì, vì sao để trong bucket (remote backend)?
- State là file JSON Terraform dùng để nhớ tài nguyên nào nó đã tạo và ID thật của chúng. `plan` so sánh code, state và hạ tầng thật.
- Mất state thì Terraform "quên" tài nguyên và tạo trùng. State có thể chứa dữ liệu nhạy cảm nên không commit git.
- Backend `gcs`: state nằm trên bucket (có versioning để quay lại bản cũ), dùng chung được cho nhiều người/CI, và có khoá để hai lệnh `apply` không chạy đè nhau.
- Xem: Console → Cloud Storage → bucket tfstate, hoặc `terraform state list` / `terraform state show <địa chỉ>`.
- Phỏng vấn: "State để ở đâu, khoá thế nào? Có người sửa tay trên Console (drift) thì xử lý ra sao?" → remote backend + khoá; drift thì `plan` sẽ hiện chênh lệch, rồi chọn `apply` để kéo về đúng code hoặc `import`/sửa code cho khớp.

### `terraform import` và drift
- `import` đưa tài nguyên đã tồn tại (tạo tay) vào state để Terraform quản lý, không tạo lại và không sửa code. Phải tự viết khối `resource` khớp thực tế rồi `plan` cho đến khi "No changes".
- Cú pháp cổ điển: `terraform import <địa chỉ> <ID>`. Từ Terraform 1.5 có block `import { to = ..., id = ... }` đi qua `plan`/`apply`, dễ review trong PR.
- **Drift** là hạ tầng thật lệch so với code/state (thường do sửa tay). `plan` refresh state rồi hiện chênh lệch: dòng `-` là giá trị thật, dòng `+` là giá trị trong code.
- Xử lý: (1) `apply` kéo về đúng code, hoặc (2) sửa code cho khớp nếu thay đổi tay là hợp lý. Phòng ngừa: siết IAM, mọi thay đổi qua PR/CI, chạy `plan` định kỳ để phát hiện drift.

### Vì sao chia `modules/` và `lab/` (root module)?
- `modules/<tên>`: khối tái sử dụng, chỉ mô tả cách dựng (VPC, node...). Không có provider/backend/giá trị cụ thể, tự nó không tạo gì.
- `lab/` là **root module**: nơi chạy `init/plan/apply`. Nó gọi module, truyền giá trị (tên, CIDR), khai báo provider và backend (state).
- Lợi ích: dùng lại cho nhiều môi trường (staging/prod gọi cùng module, giá trị khác); mỗi root một state nên `destroy` môi trường này không ảnh hưởng môi trường kia; dễ review (sửa module = sửa cách làm, sửa root = sửa giá trị).
- Output của module không tự hiện ra: `terraform output` chỉ đọc output của root, nên root phải khai báo lại `output "x" { value = module.<tên>.<output> }`.
- `for_each` thay vì `count` cho danh sách có tên: `for_each` gắn state theo key (`this["k8s"]`), xoá một phần tử không làm các phần tử khác bị đánh số lại như `count`. Dùng `count` khi cần N bản y hệt hoặc bật/tắt (`count = var.enabled ? 1 : 0`).
- Phỏng vấn: "Bạn tổ chức code Terraform thế nào cho nhiều môi trường?" → module tái dùng + mỗi môi trường một root với state riêng (hoặc workspace/Terragrunt), version module, review qua PR.
