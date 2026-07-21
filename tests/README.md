# Kiểm thử

Repo dùng `node:test` và `node:assert/strict`.

## Unit test

Unit test chỉ gọi helper thuần, không kết nối database và không thay đổi dữ liệu:

```powershell
npm test
```

Phạm vi hiện có: cú pháp memo học phí, URL VietQR, định dạng, chuyển đổi form, mật khẩu và public token.

## Integration test sổ tài chính

Integration test cần PostgreSQL đã chạy đầy đủ migration:

```powershell
npm run test:integration
```

Test sẽ từ chối chạy trước khi kết nối nếu tên database không chứa `_test`. Mỗi lượt tạo fixture có namespace riêng và chỉ xóa đúng dữ liệu do lượt đó tạo; không dùng `TRUNCATE` hay `deleteMany` không có điều kiện.

Phạm vi hiện có:

- Gán giao dịch đúng tiền và dual-write hai liên kết.
- Chặn lệch tiền; force-match bắt buộc lý do.
- Chặn dùng lại giao dịch hoặc hóa đơn.
- Unassign, reversal, resolve và audit log.
- Thu tiền mặt, phân loại bản ghi do app cũ tạo và DB state guard.
- Hai request tranh cùng giao dịch chỉ có một request thắng.

Các test cho webhook HTTP (xác thực, duplicate, chiều tiền, tài khoản nhận và CAS khi hóa đơn đổi tiền) sẽ được bổ sung cùng HTTP test harness. Trước khi triển khai production vẫn phải smoke test bằng SePay Test Mode.
