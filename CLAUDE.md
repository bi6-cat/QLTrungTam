# CLAUDE.md

## Git
- Commit message theo kiểu `type: summary` bằng tiếng Anh.
- Không thêm dòng `Co-Authored-By: Claude ...` hay "Generated with Claude Code" vào commit hoặc PR.
- Được tự commit và push lên `dev` và `gcp-lab`. Deploy prod phải có yêu cầu rõ ràng.

## Lab GCP (nhánh `gcp-lab`)

Kế hoạch: [docs/labs/gcp/README.md](docs/labs/gcp/README.md) (M0–M10, trọng tâm là kubeadm HA).
Mục tiêu phụ: phỏng vấn vị trí Kubernetes / Cloud Platform Engineer (bảng đối chiếu JD ở mục 7 của README).
Đầu mỗi phiên: đọc `docs/labs/gcp/journal.md` để biết đang dừng ở đâu.

Cách hướng dẫn:
1. Mỗi lần chỉ đưa vài bước. Mỗi bước gồm: mục tiêu/lý do, lệnh cần chạy, kết quả mong đợi.
2. Không tự chạy lệnh lab (gcloud, terraform, ansible, kubectl...). Người dùng tự chạy rồi dán output.
3. Dừng lại chờ "xong" hoặc output lỗi rồi mới sang bước tiếp.
4. Giải thích tối đa 3–4 câu cho mỗi bước. Muốn sâu hơn người dùng sẽ hỏi "tại sao".
5. Người dùng làm sai thì gợi ý trước, chưa đưa đáp án ngay.
6. Đầu milestone đưa outline (chỉ tiêu đề). Cuối buổi tóm tắt những gì đã học.

Code:
- Claude viết sẵn code mẫu cho từng module (Terraform, Ansible, manifest, Helm) thẳng vào repo,
  kèm giải thích ngắn các chỗ quan trọng và hay bị hỏi khi phỏng vấn.
- Đánh dấu những đoạn nên tự gõ để nhớ (ví dụ `kubeadm init`, `etcdctl snapshot` — hay gặp trong CKA).

Ghi chép:
- Cuối mỗi milestone: soạn `docs/labs/gcp/MXX-<tên>.md` (các bước đã làm, lệnh thực tế, lỗi và cách sửa,
  số đo, câu hỏi phỏng vấn). Người dùng duyệt rồi mới commit.
- Cuối mỗi buổi: 3–5 dòng trong `docs/labs/gcp/journal.md` (làm gì, dừng ở đâu, chi phí).

- Khi người dùng hỏi một khái niệm họ chưa biết ("X là gì", "để làm gì", "tại sao"): trả lời, rồi thêm một mục
  vào `docs/labs/gcp/hoi-dap.md` (câu hỏi, trả lời ngắn, cách nói khi phỏng vấn) để họ ôn một thể.

Chi phí: luôn nhắc stop VM khi không dùng và destroy theo mục 2 của README.
