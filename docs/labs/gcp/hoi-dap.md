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

## M2

### "Hệ thống cũ" (legacy) trong lab là gì?
- Là mô phỏng app đang chạy trên VM thường: `legacy-app` (Docker, subnet public) và `legacy-db` (PostgreSQL, subnet private, không IP public), cài bằng Ansible.
- Là điểm xuất phát của câu chuyện migration: VM → kubeadm (M3) → GKE + Cloud SQL (M5), có cutover đo downtime và rollback.
- Destroy sau M2 (giữ playbook), dựng lại nhanh ở M5 để có dữ liệu mà migrate.
- Phỏng vấn: "Kể một lần migration" → hiện trạng, kế hoạch từng bước, downtime đo được, rollback đã viết sẵn, kết quả.

### `resource "google_compute_firewall" "allow_web"` — phần nào do ai đặt?
- `google_compute_firewall` là **loại resource** do provider quy định (`<provider>_<sản phẩm>_<đối tượng>`). Gõ sai thì `validate` báo `Invalid resource type`.
- `allow_web` là **tên local** do mình đặt, chỉ để tham chiếu trong code (`google_compute_firewall.allow_web.name`). Tên thật trên GCP là thuộc tính `name`.
- Các thuộc tính bên trong cũng do provider quy định; tra ở trang provider trên registry.terraform.io (mục Docs → Resources), không cần nhớ thuộc lòng.
- Firewall GCP: `INGRESS` là chiều vào, mặc định VPC chặn mọi ingress; `source_ranges` là ai được gửi tới, `target_tags` là áp cho VM nào (đặc quyền tối thiểu), `allow` là giao thức/cổng được mở.

### Tra tài liệu Terraform và phụ thuộc giữa các resource
- Tra: tên resource theo `google_<sản phẩm>_<đối tượng>` trên registry.terraform.io; đọc Example Usage, Argument Reference (Required/Optional), Attributes Reference, Import. Viết bản tối thiểu rồi `validate`, `plan`.
- UI gộp nhiều bước vào một form (vd tạo NAT cũng tạo luôn Router); Terraform tách thành resource riêng. Tham số `Required` là tên/ID của thứ khác thì thứ đó phải có trước.
- **Phụ thuộc ngầm**: tham chiếu thuộc tính resource khác (`router = google_compute_router.this.name`), Terraform tự sắp thứ tự tạo/xoá. Xem bằng `terraform graph`.
- **Phụ thuộc rõ**: `depends_on = [...]` khi quan hệ không thể hiện qua tham chiếu (bật API, cấp quyền).
- Việc UI làm ngầm (bật API, tạo tài nguyên phụ): phát hiện qua lỗi `plan/apply` và phần Prerequisites của tài liệu GCP; mẹo: nút "Equivalent REST/command line" trên UI cho thấy UI gọi API gì.

### Sửa danh sách `nat_subnets`: update tại chỗ hay tạo lại?
- Mỗi thuộc tính của resource do provider đánh dấu: đổi thì **tạo lại** (ForceNew, vd `name`, `router`, `region`) hoặc **sửa tại chỗ**. Danh sách `subnetwork` của NAT thuộc loại sửa tại chỗ: plan hiện `~ update in-place` và `- subnetwork {...}`.
- Hệ quả thực tế: subnet bị bỏ khỏi NAT mất đường ra Internet. VM ở subnet `public` ra Internet bằng IP public riêng, không qua NAT.
- Phỏng vấn: "Plan báo `forces replacement` thì làm gì?" → đọc xem thuộc tính nào gây ra, cân nhắc downtime, dùng `create_before_destroy` hoặc đổi cách làm nếu tài nguyên đang phục vụ.

### `gcloud auth configure-docker <registry-host>` là gì?
- Cài sẵn cách đăng nhập cho Docker: thêm `"credHelpers": {"<host>": "gcloud"}` vào `~/.docker/config.json`. Chưa đăng nhập ngay.
- Khi `docker push/pull` tới host đó, Docker gọi `docker-credential-gcloud` để lấy token ngắn hạn từ tài khoản gcloud đang đăng nhập. Không lưu mật khẩu hay key dài hạn.
- Cần `source .env.gcp` trước để gcloud dùng đúng cấu hình lab. File `~/.docker/config.json` là file chung của máy.
- Phỏng vấn: "CI đẩy image lên Artifact Registry xác thực thế nào?" → Workload Identity Federation lấy token ngắn hạn rồi `docker login` bằng token đó, không dùng key JSON dài hạn (M6).

### `asia-southeast1-docker.pkg.dev` lấy ở đâu ra?
- Là host của Artifact Registry, theo công thức `<region>-docker.pkg.dev`. Region là nơi tạo repo (M0: `asia-southeast1`); `-docker` là loại kho (còn `-apt`, `-python`).
- Tên image đầy đủ: `<host>/<project-id>/<repo>/<image>:<tag>`. Docker dựa vào phần trước dấu `/` đầu tiên để biết đẩy image tới đâu.
- Tra: `gcloud artifacts repositories list` (cột LOCATION, NAME) hoặc nút copy đường dẫn trên Console.
- Phỏng vấn: "Vì sao image kéo chậm/tốn tiền egress?" → để registry cùng region với cluster.

### `docker push` báo "Unauthenticated request" dù đã `configure-docker`
- Nguyên nhân gặp thật: Docker cài bằng **snap** đọc config ở `~/snap/docker/current/.docker/config.json`, không phải `~/.docker/config.json`. `configure-docker` ghi sai chỗ nên Docker không gọi credential helper và gửi request không có token.
- Chẩn đoán theo thứ tự: (1) `credHelpers` có trong config chưa; (2) gcloud đang đăng nhập đúng cấu hình lab; (3) chạy thử `echo <host> | docker-credential-gcloud get` (che `Secret`); (4) **công cụ thực sự đọc file nào** (`which docker` ra `/snap/bin/...` là dấu hiệu).
- Sửa: `DOCKER_CONFIG=$HOME/snap/docker/current/.docker gcloud auth configure-docker <host>`. Hoặc cài Docker từ apt/get.docker.com thay cho snap.
- Phỏng vấn: "Sửa config mà không có tác dụng thì làm gì?" → xác định tiến trình đọc file nào (đường dẫn, biến môi trường, sandbox), đừng đoán.

### Push 1 image mà Artifact Registry hiện 3 digest?
- Docker/BuildKit mới đính kèm provenance mặc định, nên một lần push tạo 3 digest: **image index** (có tag `v1`, SIZE None), **manifest image thật** (~100 MB, `linux/amd64`) và **attestation** (~1.4 KB, metadata cách build).
- Pull theo tag: runtime đọc index rồi chọn manifest đúng kiến trúc. Kiểm tra: `docker buildx imagetools inspect <image>:<tag>`.
- Tag là nhãn có thể bị ghi đè; digest là hash nội dung, bất biến. Deploy production nên ghim digest của index/manifest, không phải digest của attestation.
- Phỏng vấn: "Vì sao ghim digest?" → tái lập được, chống tag bị đổi, supply-chain (M8: ký image, kiểm tra provenance).

### Digest khác gì image và tag?
- **Image**: nội dung chạy được (các layer + config). **Digest** (`sha256:...`): hash SHA-256 của manifest của image, đổi 1 byte là đổi hoàn toàn; image giống hệt nhau thì cùng digest. **Tag**: nhãn tự đặt, trỏ tới một digest, có thể bị đổi sang digest khác khi push đè.
- Ví dụ: tag như tên người, digest như số CCCD. Tham chiếu chính xác: `repo/image@sha256:...`.
- Phỏng vấn: "Vì sao ghim digest trong manifest deploy?" → cluster luôn chạy đúng bản đã test, tag bị ghi đè cũng không ảnh hưởng, dễ audit/rollback.

### `var.xxx`, `each.key`, `each.value` lấy ở đâu ra?
- `var.xxx`: biến đầu vào do module **tự khai báo** trong `variables.tf` (`variable "zone" {}` thì mới dùng được `var.zone`). Giá trị do nơi gọi module truyền vào (`lab/main.tf`).
- `each.key` / `each.value`: Terraform tự cấp bên trong resource có `for_each`, không cần khai báo. Với `for_each = var.nodes` (map): key là `cp1`, `w1`...; value là object `{ role, machine_type, spot }`, nên viết được `each.value.machine_type`.
- Muốn dùng được thì tên và kiểu phải khớp: thiếu `variable "zone"` thì `var.zone` báo lỗi; nơi gọi truyền thiếu field của `nodes` thì `plan` báo lỗi.
- Phỏng vấn: "`for_each` khác `count` thế nào?" → `for_each` định danh phần tử bằng key nên xoá một phần tử không làm các phần tử khác bị đánh số lại và tạo lại; `count` định danh bằng chỉ số.

### `cp1`, `w1` là viết tắt của gì?
- `cp` = **control plane** (node chạy kube-apiserver, etcd, scheduler, controller-manager), `w` = **worker** (node chạy pod của app). Số đi kèm chỉ để phân biệt: `cp1`-`cp3`, `w1`-`w2`.
- Đây chỉ là quy ước đặt tên của lab, không phải từ khoá của Terraform hay Kubernetes. Trên cluster, vai trò thật nằm ở label `node-role.kubernetes.io/control-plane` và taint trên node.
- Phỏng vấn: "Vì sao 3 control plane?" → etcd cần đa số (quorum): 3 node chịu được mất 1, 2 node thì mất 1 là hết quorum.

### `35.235.240.0/20` là IP gì?
- Là dải IP của **IAP (Identity-Aware Proxy) TCP forwarding**, do Google sở hữu. `35.235.240.0` là địa chỉ đầu, `/20` nghĩa là cả dải 4096 IP (`35.235.240.0` → `35.235.255.255`).
- Khi chạy `gcloud compute ssh --tunnel-through-iap`, kết nối SSH đi từ máy bạn tới IAP (kiểm tra bạn có quyền IAM), rồi IAP mới kết nối vào VM từ dải IP này. VM không có IP public vẫn SSH được.
- Vì vậy firewall `allow-iap-ssh` chỉ cần cho `source_ranges = ["35.235.240.0/20"]` vào cổng 22, không phải mở 22 cho `0.0.0.0/0`. Ai muốn vào vẫn phải qua IAM trước.
- Cùng kiểu có dải của health check LB (`35.191.0.0/16`, `130.211.0.0/22`) trong module `k8s-nodes`: đều là IP của dịch vụ Google, nên phải mở firewall thì dịch vụ đó mới chạm được VM.
- Phỏng vấn: "Vì sao SSH vào VM private qua IAP mà firewall vẫn cần rule?" → firewall GCP mặc định chặn ingress; IAP chỉ là proxy, nên phải cho phép dải IP của IAP tới cổng 22, còn quyền người dùng do IAM (`roles/iap.tunnelResourceAccessor`) quyết định.

### Có bắt buộc học microservice trên K8s không, hay K8s vẫn hay chạy monolith?
- Không bắt buộc. K8s là nền tảng chạy container, không ép kiến trúc. Monolith trên K8s rất phổ biến: 1 Deployment nhiều replica + Service + Ingress vẫn hưởng rolling update, self-healing, scale ngang, ConfigMap/Secret, môi trường nhất quán.
- Microservice thêm chi phí vận hành: service discovery, tracing, version API giữa các service, NetworkPolicy, đôi khi service mesh. Chỉ đáng khi nhiều team hoặc các phần cần scale khác nhau.
- Lab dùng `qltt-app` (monolith) là đủ cho Deployment, Service, Ingress, probes, HPA, rollout, PVC/StatefulSet, RBAC. Muốn thực hành gọi nhau giữa service thì tách sẵn app / DB / worker.
- Phỏng vấn: "Có nên chuyển monolith sang microservice khi lên K8s?" → không nhất thiết; containerize và chạy monolith trước, chỉ tách service khi có lý do rõ (scale, team, tốc độ release), vì microservice đổi độ phức tạp trong code sang độ phức tạp vận hành.

### Online Boutique (app microservice mẫu) là gì?
- Web bán hàng mẫu của Google (`GoogleCloudPlatform/microservices-demo`): 11 service nhỏ (frontend, cart + Redis, productcatalog, currency, recommendation, ad, checkout, payment, shipping, email) viết bằng nhiều ngôn ngữ, gọi nhau qua gRPC, kèm `loadgenerator` tự sinh traffic.
- Dùng để tập những thứ monolith không có: NetworkPolicy giữa service, tracing (OpenTelemetry), canary theo service, HPA theo service, gây lỗi ở một service rồi xem lỗi lan ra sao.
- Tốn tài nguyên so với quota 12 vCPU: kiểm tra `requests`, bỏ bớt service không cần, destroy sau mỗi buổi.
- Phỏng vấn: "Một service phụ (currency) chậm thì cả trang chậm, xử lý thế nào?" → timeout + retry có giới hạn, circuit breaker, đo p99 theo service bằng tracing, đặt SLO theo từng service.
