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

### Đổi một field thì Terraform sửa tại chỗ hay xoá rồi tạo lại? (ví dụ `can_ip_forward`)
- Mỗi field có một trong 3 kiểu thay đổi, do API của cloud quyết định và provider ghi lại: **sửa tại chỗ** (`labels`, `tags`), **sửa nhưng phải stop VM** (`machine_type`, `can_ip_forward` ở provider google 6.x; cần `allow_stopping_for_update = true`), **không sửa được, phải tạo lại** (`name`, `zone`, image boot disk; provider đánh dấu ForceNew).
- Ví dụ: VM như căn nhà. Sơn tường thì sửa luôn; thay tủ lạnh thì cắt điện chút; đổi móng nhà thì phải phá đi xây lại.
- Gặp thật trong lab (M3): đoán `can_ip_forward` sẽ bắt tạo lại VM (đúng với provider cũ), nhưng `plan` với provider 6.x in `~ update in-place`. Kiểu thay đổi có thể khác giữa các phiên bản provider, nên **tin `plan`, không tin trí nhớ**.
- Đọc plan: `~` = sửa tại chỗ; `-/+` = xoá rồi tạo lại, kèm dòng `# forces replacement` chỉ đúng field gây ra. Trước khi `apply`, tìm chữ này, gặp ở VM/DB/disk thì dừng lại nghĩ kỹ.
- Phỏng vấn: "Field bắt buộc tạo lại resource, làm sao tránh downtime?" → `lifecycle { create_before_destroy = true }` (tên phải khác nhau, ví dụ dùng `name_prefix`), hoặc làm kiểu blue/green: tạo node mới, `kubectl drain` node cũ rồi mới xoá; chặn xoá nhầm bằng `prevent_destroy = true`.

### Vì sao Kubernetes yêu cầu tắt swap?
- Kubelet quản lý Pod bằng **số liệu bộ nhớ chính xác**: `requests` là mức lập lịch (scheduler xếp Pod vào node còn đủ RAM), `limits` là trần (vượt thì bị OOMKill). Cả hai đều giả định "RAM = RAM thật".
- Có swap thì Linux âm thầm đẩy trang nhớ ra đĩa. Pod đặt `limits: 512Mi` vẫn "sống" khi dùng quá mức, chỉ là chậm hẳn. Scheduler tưởng node còn chỗ, nhưng node thực ra đang thrash; kubelet không thấy OOM nên không kịp phản ứng, hiệu năng Pod sụt khó đoán.
- Ví dụ: khách sạn có 10 phòng, scheduler xếp mỗi khách 1 phòng. Swap giống việc cho khách ngủ ké ngoài hành lang: vẫn "nhận" được thêm khách nhưng ai cũng khó chịu, và sổ sách (requests) không còn đúng.
- Mặc định kubelet **từ chối khởi động** nếu thấy swap bật (`failSwapOn: true`), và `kubeadm init` cảnh báo ở bước preflight. Từ K8s 1.28 có hỗ trợ swap (NodeSwap) nhưng còn hạn chế, trên cluster production vẫn tắt.
- Cách tắt, gồm hai việc: `swapoff -a` (tắt ngay) và sửa `/etc/fstab` (không bật lại sau khi reboot). Làm cả hai, vì chỉ làm vế đầu thì reboot xong lỗi quay lại.
- Phỏng vấn: "Vì sao tắt swap?" → kubelet cần bộ nhớ dự đoán được để lập lịch và OOM đúng theo `requests/limits`; swap làm sai lệch cả hai và gây thrashing. Hỏi sâu thì nhắc NodeSwap từ 1.28.
- AWS: giống hệt, đây là yêu cầu của Kubernetes chứ không của cloud. EKS node (AMI Amazon Linux, Bottlerocket) đã tắt swap sẵn.

### `k8s-api.lab.internal` là gì, sao dùng cổng 6443?
- `k8s-api.lab.internal` là **tên DNS nội bộ** trỏ tới IP của Internal Load Balancer đứng trước 3 control plane (`cp1`-`cp3`). Tên này do ta tự đặt: Terraform tạo private zone `lab.internal.` (chỉ VPC của lab phân giải được) và bản ghi A trỏ về IP của LB (module `k8s-api-lb`).
- Dùng tên thay vì IP của `cp1` vì `kubeadm init --control-plane-endpoint k8s-api.lab.internal:6443` ghi endpoint này vào mọi kubeconfig và chứng chỉ API server. Mất `cp1` thì LB chuyển sang `cp2`/`cp3`, kubelet và kubectl không phải sửa gì. Muốn đổi IP LB chỉ sửa bản ghi DNS.
- **6443 là cổng mặc định của kube-apiserver** (HTTPS). Không dùng 443 vì apiserver chạy như tiến trình thường trên node, có thể trùng với dịch vụ khác; 6443 là quy ước chung nên công cụ (kubeadm, kubectl, firewall mẫu) đều mặc định theo. Cổng khác trong control plane: etcd 2379/2380, kubelet 10250, scheduler 10259, controller-manager 10257.
- LB là kiểu **TCP passthrough** (layer 4): không giải mã TLS, chỉ chuyển gói tới một trong các apiserver, nên chứng chỉ phải có `k8s-api.lab.internal` trong SAN (kubeadm tự thêm từ `--control-plane-endpoint`).
- Ví dụ: số tổng đài công ty (tên + cổng cố định) thay vì số di động của từng nhân viên; nhân viên nghỉ thì cuộc gọi chuyển cho người khác.
- Phỏng vấn: "HA cho API server làm thế nào?" → chạy 3 control plane, đặt LB TCP 6443 phía trước kèm DNS/VIP ổn định, dùng làm `controlPlaneEndpoint` ngay lúc `kubeadm init`; health check của LB loại node apiserver hỏng. Đổi endpoint sau khi đã init rất đau (chứng chỉ, kubeconfig), nên phải chọn từ đầu.
- AWS: tương đương NLB nội bộ (TCP 6443) + bản ghi Route 53 private hosted zone. EKS giấu phần này, endpoint do AWS quản lý.

### `getent` là gì, phạm vi hoạt động?
- `getent` = **get entries**: lấy bản ghi từ các database quản trị của hệ thống **qua NSS** (Name Service Switch), cùng đường mà `ping`, `ssh`, `kubectl` dùng để tra tên. Thứ tự nguồn nằm trong `/etc/nsswitch.conf` (ví dụ `hosts: files dns` = đọc `/etc/hosts` trước rồi mới tới DNS).
- Database tra được: `hosts` (tên ↔ IP), `passwd`, `group`, `services` (tên ↔ cổng, vd `getent services https` ra `443/tcp`), `protocols`, `networks`, `shadow`... Nguồn có thể là file cục bộ, DNS, LDAP/SSSD.
- Khác `dig`/`nslookup`: hai lệnh này chỉ hỏi DNS, bỏ qua `/etc/hosts`. Muốn biết chương trình thật sự thấy IP nào thì dùng `getent hosts`.
- Mã thoát: `0` tìm thấy, `2` không tìm thấy, `1` sai cú pháp, `3` database không cho liệt kê.
- Phỏng vấn: "`dig` ra IP đúng nhưng `ping` báo không tìm thấy?" → hai lệnh dùng hai đường khác nhau; kiểm tra `getent hosts`, `/etc/nsswitch.conf`, `/etc/hosts`. "User có trong LDAP mà `cat /etc/passwd` không thấy?" → dùng `getent passwd <tên>`.

### Cài `local-path-provisioner` và đặt StorageClass mặc định để làm gì?
- Cluster kubeadm mới dựng **không có StorageClass**, nên PVC đứng `Pending` vì không ai tạo PV. EKS/GKE có sẵn (EBS, Persistent Disk) nên không gặp.
- `local-path-provisioner` là một Pod theo dõi PVC; có PVC mới thì tạo thư mục trên đĩa của node chứa Pod (mặc định `/opt/local-path-provisioner/...`) và tạo PV trỏ vào đó (dynamic provisioning). Manifest cũng tạo StorageClass `local-path`.
- Annotation `storageclass.kubernetes.io/is-default-class: "true"` làm PVC không ghi `storageClassName` tự dùng class này; thiếu thì Helm chart không chỉ định class sẽ bị `Pending`. Chỉ nên có một class mặc định.
- `WaitForFirstConsumer`: chờ Pod được xếp lịch rồi mới tạo ổ ở node đó. `RECLAIMPOLICY Delete`: xoá PVC thì xoá cả dữ liệu.
- Hạn chế: dữ liệu nằm trên một node, node chết hoặc Pod sang node khác là mất dữ liệu, không replication. Chỉ hợp cho lab; production dùng CSI với đĩa mạng (EBS CSI, `pd-csi`, Ceph/Rook, Longhorn).
- Phỏng vấn: "PVC bị `Pending`, kiểm tra gì?" → có StorageClass mặc định chưa, provisioner có chạy không, `kubectl describe pvc` xem event; với `WaitForFirstConsumer` thì `Pending` khi chưa có Pod dùng nó là bình thường.

### PVC là gì? (và PV, StorageClass)
- **PVC (PersistentVolumeClaim)** = phiếu yêu cầu ổ đĩa của app: dung lượng, `accessModes`, `storageClassName`. **PV** = ổ đĩa thật (thư mục trên node, đĩa cloud). **StorageClass** = "công thức" tạo PV tự động (dùng provisioner nào, kiểu đĩa nào).
- Luồng: tạo PVC → StorageClass chỉ provisioner → provisioner tạo PV → Kubernetes bind PV vào PVC → Pod mount PVC. Ví dụ: PV là phòng kho thật, PVC là đơn xin thuê "cần 5 mét vuông", StorageClass là công ty cho thuê biết cách chia phòng.
- Tách PVC khỏi Pod vì dữ liệu sống lâu hơn Pod: Pod chết/tạo lại vẫn mount đúng PVC cũ. Manifest cũng không phụ thuộc loại đĩa, chỉ đổi `storageClassName`.
- StatefulSet dùng `volumeClaimTemplates` để mỗi replica có PVC riêng (`pgdata-0`, `pgdata-1`...). CloudNativePG cũng tạo PVC cho từng instance PostgreSQL.
- `accessModes`: `ReadWriteOnce` (một node ghi, phổ biến nhất), `ReadWriteMany` (nhiều node ghi, cần NFS/CephFS), `ReadOnlyMany`.
- AWS: PVC giống nhau mọi nơi; trên EKS với `gp3` thì EBS CSI driver đổi PVC thành một EBS volume; GKE là Persistent Disk.
- Phỏng vấn: "PV, PVC, StorageClass khác nhau thế nào?" → PV là ổ thật, PVC là yêu cầu của app, StorageClass là cách tạo PV tự động; app chỉ viết PVC, cluster lo phần còn lại.

### Volume trong Kubernetes: tổng quan
- Hệ thống file của container là tạm: restart là mất, hai container trong Pod không thấy file của nhau. Volume là thư mục gắn từ ngoài vào để giữ dữ liệu và chia sẻ dữ liệu.
- Volume khai báo trong Pod (vòng đời theo Pod): `emptyDir` (thư mục tạm dùng chung trong Pod, mất khi Pod bị xoá), `configMap`/`secret` (đưa cấu hình vào dạng file), `hostPath` (mount thư mục của node, tránh dùng cho app vì Pod sang node khác là mất).
- Volume bền vững (vòng đời độc lập với Pod): PV (ổ thật) + PVC (phiếu yêu cầu) + StorageClass (công thức tạo PV, trỏ tới CSI driver). Trong Pod: `volumes` khai báo nguồn (`persistentVolumeClaim.claimName`), `volumeMounts` nói gắn vào `mountPath` nào.
- Thuộc tính hay gặp: `accessModes` (RWO/RWX/ROX), `reclaimPolicy` (`Delete`/`Retain`), `volumeBindingMode` (`Immediate`/`WaitForFirstConsumer`). StatefulSet + `volumeClaimTemplates` cho mỗi replica một PVC riêng (`pgdata-0`, `pgdata-1`).
- Ví dụ: container như phòng khách sạn (khách đi là dọn sạch), `emptyDir` là cái bàn trong phòng, PVC là két gửi ở quầy lễ tân, đổi phòng vẫn lấy lại được.
- `local-path` + RWO: dữ liệu dính vào một node; Pod thứ hai ở node khác mount cùng PVC sẽ kẹt `ContainerCreating`. Vì vậy cần replication (CloudNativePG) chứ PVC không thay cho backup.
- Phỏng vấn: "Dữ liệu database không mất khi Pod chết bằng cách nào?" → StatefulSet + `volumeClaimTemplates`, storage không gắn vòng đời Pod; thêm `reclaimPolicy` phù hợp, `WaitForFirstConsumer` cho đúng zone, và backup/replication vì PVC không phải backup.

### Traefik là gì?
- Reverse proxy / **ingress controller** viết bằng Go: cổng vào cho traffic HTTP/HTTPS từ ngoài, nhìn `Host`/path rồi chuyển tới đúng Service trong cluster. Đối tượng `Ingress` chỉ là khai báo; cần controller như Traefik chạy thật thì luật mới có tác dụng (giống StorageClass cần provisioner).
- Vì sao cần: Service `ClusterIP` chỉ dùng trong cluster; mỗi app một LB riêng thì tốn tiền. Ingress cho một cổng chung chia traffic theo luật (`app.example.com/api` → `qltt-app`, `grafana.example.com` → `grafana`).
- Cách chạy: Pod trong cluster, theo dõi API server, tự cập nhật luật khi `Ingress`/`IngressRoute`/`HTTPRoute` đổi, không cần restart. Làm được TLS (kể cả Let's Encrypt), redirect, middleware (auth, rate limit, rewrite).
- Luồng trong lab (3.6): Internet → External LB (IP public) → NodePort 30000-32767 trên node → Traefik Pod → luật Ingress → Service `qltt-app` → Pod.
- So sánh: ingress-nginx (phổ biến, nhưng dự án Kubernetes đã thông báo dừng bảo trì từ khoảng đầu 2026, cần kiểm tra lại); Gateway API là chuẩn kế nhiệm Ingress (Traefik hỗ trợ cả hai; M5 dùng Gateway trên GKE); GKE Ingress/AWS ALB dùng LB của cloud làm lớp xử lý.
- AWS: gần nhất là ALB (AWS Load Balancer Controller), hoặc chạy Traefik/NGINX sau một NLB.
- Phỏng vấn: "Ingress và Service `LoadBalancer` khác nhau thế nào?" → Service `LoadBalancer` tạo một LB cho một Service (layer 4); Ingress là cổng chung layer 7 chia traffic theo host/path tới nhiều Service, tiết kiệm LB và làm TLS/redirect/auth tập trung; cần controller như Traefik.

### Security Group (SG) và Network ACL (NACL) khác nhau thế nào? (AWS)
- **SG**: tường lửa gắn vào instance/ENI, **stateful** (cho phép chiều đi thì chiều về tự được), chỉ có luật **allow**, xét mọi luật, mặc định chặn inbound và cho phép outbound; nguồn có thể là CIDR hoặc **một SG khác**.
- **NACL**: gắn vào cả **subnet**, **stateless** (chiều đi và chiều về đều cần luật), có cả **allow và deny**, xét theo **số thứ tự tăng dần**, khớp luật đầu tiên thì dừng; NACL mặc định của VPC cho phép hết, NACL tự tạo thì chặn hết; chỉ dùng CIDR.
- Lỗi kinh điển: NACL quên luật outbound cho **cổng tạm (ephemeral, ~1024-65535)** nên kết nối đến được nhưng response không ra, bị treo.
- Ví dụ: SG là bảo vệ đứng trước từng phòng, nhớ mặt người đã vào nên cho ra tự nhiên; NACL là cổng kiểm soát cả toà nhà, mỗi lần qua đều xuất trình lại và có danh sách đen.
- Thực tế: phần lớn dùng SG ("chỉ SG của app gọi được DB"); NACL dùng khi cần chặn rõ một dải IP hoặc thêm lớp cấp subnet.
- GCP: VPC firewall rule gần SG nhất (stateful, áp qua network tag/service account, như `allow-iap-ssh`) nhưng có cả allow lẫn deny và `priority` (số nhỏ thắng). GCP không có NACL cấp subnet; chặn rộng hơn dùng deny rule hoặc hierarchical firewall policy.
- Phỏng vấn: "SG và NACL khác nhau thế nào?" → SG cấp instance, stateful, chỉ allow; NACL cấp subnet, stateless, allow + deny, xét theo thứ tự; nhấn mạnh phải mở cổng tạm cho chiều về ở NACL và SG tham chiếu được SG khác.

### Manifest là gì?
- File (thường YAML) mô tả **trạng thái mong muốn** của một đối tượng Kubernetes; đưa cho API server bằng `kubectl apply -f`, controller trong cluster tự biến thực tế thành đúng như mô tả.
- Bốn phần chính: `apiVersion`, `kind`, `metadata` (tên, namespace, labels), `spec` (trạng thái mong muốn; Secret/ConfigMap dùng `data`). Một file có thể chứa nhiều đối tượng, ngăn bằng `---`.
- **Declarative** (khai báo "tôi muốn 2 replica", controller so trạng thái mong muốn với thực tế rồi tự sửa) khác **imperative** (`kubectl run`, `kubectl scale`: ra lệnh từng bước). Manifest lưu được trong git, review được, áp lại cho kết quả giống nhau. Ví dụ: manifest là bản vẽ nhà, controller là thợ làm cho giống bản vẽ.
- Liên quan: Helm sinh manifest từ template + values; Argo CD (GitOps) coi manifest trong git là nguồn sự thật.
- Lệnh hay dùng: `kubectl apply -f`, `kubectl diff -f` (xem sẽ đổi gì), `kubectl get <loại> <tên> -o yaml` (manifest đang chạy, có thêm `status`), `kubectl explain deployment.spec` (tra field, hay gặp trong CKA).
- Phỏng vấn: "Declarative khác imperative thế nào?" → declarative mô tả trạng thái mong muốn và để controller hội tụ, lặp lại được và hợp GitOps; imperative tiện cho thao tác nhanh hoặc debug.

### Manifest thuần và Helm khác gì? Ôn phỏng vấn nên học cách nào?
- **Manifest thuần**: YAML cố định, viết từng đối tượng, `kubectl apply/delete`. Đơn giản, đọc là hiểu, nhưng không tham số hoá (đổi image/replicas phải sửa file hoặc dùng Kustomize).
- **Helm**: chart = template YAML + `values.yaml`; Helm điền giá trị rồi sinh manifest. Có **release** để `helm list/upgrade/rollback/history/uninstall` cả bộ; chia sẻ qua repo (vd `traefik/traefik`). Đổi lại phải thêm lớp template (`{{ }}`), debug bằng `helm template`.
- Ví dụ: manifest thuần là bản vẽ cố định; Helm là bản vẽ có chỗ trống kèm bộ quản lý xây, nâng cấp và phá cả công trình bằng một lệnh.
- **Kustomize**: giữ YAML thuần và vá theo môi trường bằng overlay, không template; có sẵn trong `kubectl`; Argo CD hỗ trợ cả Helm lẫn Kustomize.
- Ôn phỏng vấn: **học manifest thuần trước** (Helm chỉ sinh ra manifest; không đọc được Deployment/Service/PVC/Ingress thì không debug được chart; CKA/CKAD bắt viết YAML thuần), **rồi Helm** ở mức cài phần mềm có sẵn (`upgrade --install`, `-f values.yaml`, `helm template`, `history`/`rollback`) và tự viết một chart nhỏ (M5.3).
- Cách nói: "App của tôi viết manifest thuần cho rõ và dễ review; phần mềm bên thứ ba (Traefik, kube-prometheus-stack, Argo CD) cài bằng Helm; nhiều môi trường thì đóng gói chart hoặc dùng Kustomize overlay, Argo CD áp dụng từ git."
- Phỏng vấn: "Helm và Kustomize khác nhau thế nào?" → Helm dùng template + values, có release để upgrade/rollback; Kustomize không template, vá lên manifest gốc bằng overlay. Helm hợp khi cần đóng gói và chia sẻ; Kustomize hợp khi muốn giữ YAML thuần và chỉ khác nhau chút ít giữa môi trường.

### Helm và chart là gì?
- **Helm** = CLI quản lý gói cho Kubernetes (như `apt`, `npm`). **Chart** = một gói: template manifest + `values.yaml` mặc định + `Chart.yaml` (tên, `version` của chart, `appVersion`). **Values** = giá trị bạn ghi đè (`--set`, `-f values.yaml`). **Release** = một lần cài chart vào cluster, có tên và số revision.
- Cấu trúc chart: `Chart.yaml`, `values.yaml`, `templates/` (manifest có chỗ trống như `replicas: {{ .Values.replicas }}`).
- Luồng: chart (từ repo) + values → Helm render → manifest thuần → API server → Helm lưu release (mặc định là Secret trong namespace của release) nên mới `history`/`rollback`/`uninstall` cả bộ được. Một chart cài được thành nhiều release.
- Lệnh hay dùng: `helm repo add/update`, `helm search repo`, `helm show values <chart>`, `helm upgrade --install`, `helm list -A`, `helm history`, `helm rollback`, `helm uninstall`, `helm template` (sinh manifest mà không cài).
- Chart khác image: image là thứ chạy (Dockerfile đóng gói app), chart là cách triển khai image đó lên Kubernetes; chart chỉ tham chiếu tới image. Chart `version` và image tag là hai thứ riêng, ghi đè image bằng `--set image.tag=...`.
- Phỏng vấn: "Helm là gì, chart và release khác nhau thế nào?" → Helm là package manager cho Kubernetes; chart là gói chứa template manifest và giá trị mặc định; release là một lần cài chart, có tên và lịch sử revision để upgrade/rollback.

### CloudNativePG (CNPG) là gì?
- **Operator** chạy PostgreSQL trên Kubernetes (dự án mã nguồn mở khởi đầu từ EDB, thuộc CNCF; cần kiểm tra lại mức Sandbox/Incubating trên trang dự án). Khai báo `kind: Cluster` (`postgresql.cnpg.io/v1`) với `instances: 3`, operator tự dựng, nối replication, failover, backup.
- **Operator = CRD + controller**: CRD thêm loại đối tượng mới, controller kéo thực tế về đúng mô tả, nhưng biết nghiệp vụ PostgreSQL (ai là primary, khi nào promote, khi nào base backup).
- Làm được: streaming replication (1 primary + replica), failover tự động, Service sẵn (`<tên>-rw` luôn trỏ primary, `-ro` chỉ replica, `-r` mọi instance), backup + WAL lên object storage và PITR, rolling update có switchover.
- Lưu trữ: mỗi instance một PVC. CNPG **không dùng StatefulSet**, tự quản lý Pod và PVC để kiểm soát promote/thay thế từng instance. Dữ liệu an toàn nhờ replica ở node khác, không nhờ PVC.
- Trong lab: 3.7 tạo Cluster cho app, Job migrate chạy qua Service `-rw`; 4.3 stop worker chứa primary xem promote; M5.5 `pg_dump` sang Cloud SQL.
- So sánh: RDS/Aurora, Cloud SQL làm hộ (ít kiểm soát, phí cao hơn); operator khác: Zalando (Patroni), Crunchy PGO, Percona; StatefulSet thuần thì failover, backup, PITR phải tự viết.
- Phỏng vấn: "Chạy database trên Kubernetes có ổn không?" → ổn nếu dùng operator trưởng thành có replication, failover, backup/PITR và đã diễn tập khôi phục; chọn managed hay tự chạy tuỳ đội vận hành, chi phí, nhu cầu kiểm soát.

### Xâu chuỗi các khái niệm (bản đồ tổng)
- Ý xuyên suốt: **khai báo + controller**. Bạn khai báo điều mình muốn, một controller biến nó thành thật: Deployment → controller-manager; PVC → provisioner (qua StorageClass); Ingress → Traefik; `Cluster` (CNPG) → operator CNPG; chart + values → Helm (sinh manifest, nhớ thành release). Cluster kubeadm "chỉ có khung" vì nhiều loại khai báo chưa có người thực hiện cho tới khi cài add-on.
- Các tầng, dưới lên: 0 hạ tầng GCP (Terraform: VPC, VM, firewall, NAT, LB, DNS) → 1 máy (Ansible: containerd, kubeadm, tắt swap) → 2 cluster (kubeadm: apiserver, etcd, scheduler, controller-manager, kubelet, CNI, CoreDNS, Internal LB 6443) → 3 đóng gói (Helm hoặc manifest thuần) → 4 add-on (local-path, Traefik, metrics-server) → 5 operator (CNPG = CRD + controller) → 6 app (Dockerfile → image → Deployment → Service → Ingress).
- Luồng người dùng: External LB → Traefik → Service → Pod app → Service `-rw` → PostgreSQL primary. Người quản trị đi qua IAP; kubelet/kubectl đi qua Internal LB:6443.
- Cặp dễ nhầm: image (thứ chạy) / chart (cách triển khai); chart (gói) / release (một lần cài); manifest (YAML thuần) / Helm (sinh manifest); Ingress (khai báo) / Traefik (phần mềm thực hiện); operator (phần mềm trong cluster) / chart (cách cài); PVC (phiếu) / PV (ổ thật) / StorageClass (công thức); IAP (cho người) / LB (cho cluster).
- Phỏng vấn: "Giải thích Kubernetes trong một phút" → khai báo trạng thái mong muốn bằng manifest, API server lưu vào etcd, controller liên tục so thực tế với mong muốn và sửa cho khớp; storage, ingress, database đều theo mẫu đối tượng khai báo + controller; Helm lo đóng gói và vòng đời release, operator đóng gói kiến thức vận hành.

### Namespace dùng để làm gì?
- Chia cluster thành các khu riêng về mặt **logic** (không phải cluster hay máy riêng). Tên chỉ cần duy nhất trong namespace; gom đối tượng theo nhóm (lab: `cnpg-system`, `traefik`, `local-path-storage`, sau này `qltt`, `boutique`); là phạm vi áp RBAC, ResourceQuota, NetworkPolicy; xoá namespace là xoá hết thứ bên trong (bài Velero M7.7, dọn `boutique`).
- **Không phải ranh giới bảo mật đủ mạnh**: mặc định Pod ở namespace này vẫn gọi được Pod ở namespace khác; muốn chặn cần NetworkPolicy (M8.2), Pod Security, RBAC.
- Đối tượng **namespaced**: Pod, Service, Deployment, PVC, Ingress. Đối tượng **cluster-scoped**: Node, PV, StorageClass, CRD, Namespace.
- DNS: `<service>.<namespace>.svc.cluster.local`; cùng namespace gọi tắt tên Service, khác namespace phải kèm `.<namespace>`.
- `-n <ns>` chọn namespace cho lệnh; bỏ `-n` thì dùng `default`; `-A` xem mọi namespace; `kubectl config set-context --current --namespace=<ns>` đặt mặc định.
- AWS: không có tương đương trực tiếp (namespace là phân vùng bên trong một cluster; AWS dùng account/VPC/resource group ở tầng lớn hơn).
- Phỏng vấn: "Namespace có cô lập hoàn toàn không?" → không; chỉ tách logic (tên, RBAC, quota, NetworkPolicy theo namespace), mạng và bảo mật phải cấu hình thêm; tách mạnh thì dùng cluster riêng.

### Phần mềm chạy trên Kubernetes gọi là gì? (workload, add-on, control plane)
- **Workload** (khối lượng công việc) là tên chung cho ứng dụng chạy trên cluster. Hình dạng: Deployment (app không giữ trạng thái), StatefulSet (cần tên/ổ cố định), DaemonSet (mỗi node một Pod), Job/CronJob (chạy một lần hoặc theo lịch). Bên dưới tất cả là **Pod**, đơn vị nhỏ nhất chứa container.
- Ba lớp trong cluster, theo ai quản lý: **control plane** (apiserver, etcd, scheduler, controller-manager, do kubeadm dựng, chạy dạng static pod trên cp) → **add-on / system component** (CNI Calico, CoreDNS, kube-proxy, Traefik, metrics-server, operator CNPG, Headlamp; do người quản trị cài để cluster đủ dùng) → **workload của ứng dụng** (app `qltt`, `boutique`, database; do đội phát triển triển khai).
- Ranh giới giữa add-on và workload mờ: Traefik cũng là Deployment, nhưng vai trò là hạ tầng chung. Cách nói thông dụng: "platform component" (của đội platform) so với "application workload" (của đội app).
- Lab: control plane và add-on nằm sẵn trên Map của Headlamp; workload của bạn sẽ là app `qltt` ở 3.7 và `boutique` ở M4.
- Phỏng vấn: "Workload là gì?" → mọi thứ chạy trên cluster do người dùng khai báo, hình dạng Pod được quản lý bởi controller (Deployment, StatefulSet, DaemonSet, Job); control plane và add-on là phần để cluster vận hành được.

### Cột "Type" trong danh sách firewall GCP là gì? Có "Firewall policies" khác gì rule thường?
- "Type" là **chiều** của rule: Ingress (vào VM) hoặc Egress (ra khỏi VM), không phải loại chính sách. Mặc định VPC chặn mọi ingress và cho mọi egress.
- **VPC firewall rule** gắn vào một VPC. **Firewall policy** là bộ rule gom lại, gắn được ở cấp tổ chức, thư mục hoặc VPC, dùng chung cho nhiều dự án. **Cloud NGFW** là bản nâng cao (lọc theo ứng dụng, chặn xâm nhập), có nhiều bậc giá.
- AWS: Security Group (theo máy, stateful) + NACL (theo subnet); **Firewall Manager** quản lý rule tập trung nhiều account; **Network Firewall** lọc sâu như NGFW; **WAF** lọc tầng HTTP.
- Phỏng vấn: "Firewall GCP khác Security Group AWS?" → GCP rule ở cấp VPC, chọn máy bằng tag/service account, có cả allow và deny kèm priority, không có NACL; AWS SG gắn vào ENI, chỉ allow.

### metrics-server báo lỗi x509 khi lấy số liệu kubelet, xử lý sao?
- kubelet dùng chứng chỉ tự ký không có IP của node, nên metrics-server từ chối kết nối. Lab: thêm cờ `--kubelet-insecure-tls`. Production: bật `serverTLSBootstrap` để kubelet xin chứng chỉ do CA của cluster ký.
- metrics-server chỉ cho `kubectl top` và HPA (số liệu tức thời, không lưu lịch sử). Muốn biểu đồ, cảnh báo thì dùng Prometheus.

### Vì sao Traefik dùng hostPort 80/443 trên worker?
- LB ngoài kiểu passthrough không đổi cổng: gói tin tới worker vẫn là cổng 80/443, nên Pod Traefik phải mở đúng cổng đó trên node (hostPort). Vì vậy mỗi worker chỉ chạy một Pod Traefik, và health check TCP:80 của LB chỉ đạt trên worker có Pod đó.
- Scheduler chỉ đặt Pod mới, không tự cân bằng lại Pod cũ; muốn dàn đều phải dùng anti-affinity hoặc topology spread.
