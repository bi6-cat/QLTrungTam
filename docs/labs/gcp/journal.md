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

## 2026-10-23 · M3 (bắt đầu)
- Viết module `k8s-nodes` (5 VM private: cp1-3, w1-2, firewall health-check LB) và `k8s-api-lb` (internal LB + DNS riêng cho API endpoint), nối vào root `infra/lab`. Đã `apply`.
- Đổi worker từ spot sang on-demand `t2d-standard-2`. Chưa ghi journal buổi này nên bổ sung sau.
- Cuối tuần đã xoá tay 5 VM trên Console để đỡ tốn tiền.

## 2026-10-26 · M3 (kiểm tra lại)
- Kiểm GCP: 0 VM, 0 disk; còn forwarding rule `k8s-api` (10.10.2.7), NAT và mạng. State Terraform vẫn nhớ 5 VM nên bị drift.
- `terraform plan`: 5 to add (VM), 1 to change (`instance_group.cp`: `instances` `[]` -> known after apply, vì GCP tự bỏ VM đã xoá khỏi group).
- Quyết định: giữ LB, không `-target destroy`; chạy `apply` dựng lại cụm khi bắt đầu học M3.
- Dừng ở: đầu M3, chưa apply lại. Chi phí: rất nhỏ (LB + NAT chạy theo giờ).

## 2026-10-26 · M3 (3.3–3.5)
- Apply lại 5 VM. Ansible (cài trên máy bạn, vào VM qua IAP bằng ProxyCommand `gcloud compute start-iap-tunnel`; `ansible_user` phân biệt hoa thường: `QUANGNV3`). Role `k8s-common`: tắt swap, kernel module + sysctl, containerd (`SystemdCgroup=true`), kubeadm/kubelet/kubectl v1.33.13 (hold).
- `kubeadm init` trên cp1 (Pod CIDR 192.168.0.0/16, Service CIDR 10.96.0.0/12), Calico VXLAN (đổi từ `VXLANCrossSubnet` vì VPC GCP không route IP Pod). Join cp2, cp3, w1, w2: 5 node `Ready`.
- Lỗi gặp: `/etc/containerd` chưa tồn tại, gõ sai tên miền khi `getent`, thiếu `sudo` khi join worker, `join` cp2 treo (đã tự xử lý).
- Dừng ở: hết 3.5, còn 3.6 (local-path, metrics-server, Traefik + External LB) và 3.7 (deploy app). Còn việc dọn: dòng `/etc/hosts` tạm trên cp1, cp2, cp3. Chi phí: 5 VM chạy vài giờ + LB + NAT; nhớ stop VM.

## 2026-10-27 · M3 (3.6, đầu 3.7)
- Kiểm cụm 3 cp + stacked etcd, diễn tập tắt cp1 vẫn chạy; bỏ `/etc/hosts` tạm, API đi qua `k8s-api.lab.internal`. Cài local-path, metrics-server (`--kubelet-insecure-tls`), Traefik 3 bản (hostPort) và External LB (`136.85.0.184`, 3 worker HEALTHY). Thêm worker w3 (6 node Ready).
- CloudNativePG 2 bản chạy ổn; đổi toàn bộ mật khẩu Secret. Thêm module `k8s-ingress-lb`, manifest thuần ở `deploy/gcp-lab/`.
- Dừng ở: 3.7 bước kéo ảnh `qltt-app:v1` từ Artifact Registry (chưa chọn token hay service account), rồi migrate Job, app, Ingress Traefik, DNS `k8s.gcp.zett.io.vn`. Push GitHub còn vướng credentials. Chi phí: 6 VM + LB ngoài + NAT; nhớ stop VM.
