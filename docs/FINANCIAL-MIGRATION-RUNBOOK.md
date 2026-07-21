# Runbook migration dữ liệu tài chính

Mục tiêu là triển khai theo mô hình **expand → backfill/verify → contract**, không sửa code trực tiếp trên EC2 và không xóa cột cũ trong cùng lần deploy thêm cấu trúc mới.

## 1. Preflight production

1. Bật maintenance ngắn hoặc chọn thời điểm không có người thu tiền/chuyển khoản.
2. Chạy `npm run audit:data`; dừng nếu exit code khác `0`.
3. Ghi lại số lượng và tổng tiền theo trạng thái/phương thức.
4. Tạo `pg_dump -Fc`, kiểm tra bằng `pg_restore --list`.
5. Copy dump ra ngoài EC2 và restore thử vào database tạm.
6. Ghi lại commit ứng dụng và danh sách `_prisma_migrations` hiện tại.

## 2. Release expand sổ giao dịch

- Chỉ thêm enum/cột nullable hoặc có default, bảng `AuditLog` và unique constraint đã qua audit.
- Backfill `cash` khi `rawPayload.method = cash` hoặc `gatewayRef` bắt đầu bằng `CASH-`; phần còn lại là `bank_transfer`.
- Trong giai đoạn chuyển tiếp, ứng dụng dual-write cả hai liên kết `MonthlyInvoice.transactionId` và `Transaction.matchedInvoiceId`.
- Không tự chọn một phía khi hai liên kết cũ mâu thuẫn; dừng và đối soát thủ công.

Gate sau deploy:

- Không có một giao dịch dùng cho nhiều hóa đơn hoặc ngược lại.
- Hai liên kết transaction–invoice khớp hai chiều.
- Tổng số lượng và tổng tiền trước/sau migration không đổi.
- Tiền mặt và chuyển khoản được tách đúng.
- Webhook gửi lặp vẫn chỉ đóng một hóa đơn.
- Assign, force-assign, unassign và reversal đều có audit log.

## 3. Release expand dữ liệu theo tháng

- Thêm snapshot tháng và trạng thái invoice mới nhưng chưa xóa trường enrollment cũ.
- Backfill snapshot từ từng invoice bằng chính `sessions` và `pricePerSession` của invoice.
- Không lấy trạng thái enrollment hiện tại để bịa trạng thái cho các tháng lịch sử.
- Enrollment bảo lưu nhưng còn invoice unpaid phải đưa vào danh sách review; không tự void/waive.
- Chỉ bật ghi `void/waived` sau khi toàn bộ code đọc cũ đã hiểu hai trạng thái này.

## 4. Release contract

Chỉ thực hiện sau ít nhất một chu kỳ đối soát ổn định:

1. Tạo và xác minh backup mới.
2. Chạy lại audit, yêu cầu không còn null/lệch/trùng ngoài ngoại lệ đã duyệt.
3. Dừng dual-write.
4. Xóa liên kết hoặc cột legacy, đổi cascade thành restrict và siết NOT NULL/FK cần thiết.

Migration expand giữ tương thích ở mức schema, nhưng **không được coi rollback code-only là an toàn cho nghiệp vụ tài chính** sau khi phiên bản mới đã phát sinh unassign/reversal. Bản cũ không hiểu đầy đủ trạng thái mới và logic gán cũ không có conditional claim. CHECK constraint và trigger phân loại tiền mặt chỉ là lớp bảo vệ bổ sung, không thay thế quy trình rollback.

Nếu buộc phải rollback code trong giai đoạn expand:

1. Bật maintenance, dừng webhook và không cho thu/gán/sửa học phí.
2. Chạy audit dữ liệu trên schema hiện tại.
3. Ưu tiên sửa tiến (corrective forward). Chỉ chạy code cũ để phục vụ thao tác đọc trong lúc chuẩn bị bản sửa.
4. Chỉ mở lại thao tác tài chính sau khi phiên bản mới hoặc bản hotfix đã được triển khai và audit đạt.

Sau contract, rollback có thể cần restore DB và sẽ làm mất mọi giao dịch phát sinh sau thời điểm dump; vì vậy luôn ưu tiên corrective forward migration.
