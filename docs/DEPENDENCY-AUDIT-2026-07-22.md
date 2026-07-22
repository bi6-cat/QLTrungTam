# Ghi nhận dependency audit ngày 2026-07-22

Production lockfile đang dùng `next@15.5.21` và `eslint-config-next@15.5.21`. Đây là bản vá bảo mật của nhánh Next 15: <https://github.com/vercel/next.js/releases/tag/v15.5.21>.

`npm audit --omit=dev` hiện còn `0 critical`, `2 high`, `3 moderate`, đều là phụ thuộc bắc cầu chưa có bản sửa tương thích từ upstream:

- `sharp@0.34.5`: advisory chỉ tác động khi xử lý ảnh không tin cậy. Ứng dụng không dùng `next/image`, không upload ảnh và đã đặt `images.unoptimized=true`, nên endpoint `/_next/image` trả 404. Không ép `sharp@0.35.x` vì Next 15.5.21 chỉ khai báo hỗ trợ `^0.34.3`, còn Sharp 0.35 có breaking changes. Nguồn: <https://github.com/lovell/sharp/security/advisories/GHSA-f88m-g3jw-g9cj> và <https://github.com/lovell/sharp/releases/tag/v0.35.0>.
- `postcss@8.4.31` là bản Next đóng gói riêng cho build. Source production được build từ repo tin cậy; chờ Next backport thay vì override gói nội bộ. Theo dõi: <https://github.com/vercel/next.js/pull/93288>.
- `uuid@8.3.2` đi qua ExcelJS 4.4.0. Advisory cần caller dùng UUID v3/v5/v6 với output buffer, trong khi đường ExcelJS hiện dùng `uuid.v4()` không truyền buffer. Nguồn: <https://github.com/advisories/GHSA-w5hq-g745-h8pq>.

Không chạy `npm audit fix --force`: npm hiện đề xuất downgrade Next xuống 9.x và ExcelJS xuống 3.x, đều là thay đổi phá vỡ ứng dụng. Khi Next hoặc ExcelJS phát hành bản tương thích, cập nhật lockfile rồi chạy lại build, unit, integration và smoke test trước deploy.

Lệnh kiểm tra:

```bash
npm audit --omit=dev
rg 'next/image|sharp|uuid' src
```
