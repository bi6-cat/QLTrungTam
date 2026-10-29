# Module nghiệp vụ

App vẫn là một khối (một tiến trình, một database, một lần deploy), nhưng code mới chia
theo nghiệp vụ trong `src/modules/<tên>`. Code cũ trong `src/lib` chuyển dần sang đây khi
có dịp sửa tới.

| Module | Phạm vi | Được phụ thuộc |
|---|---|---|
| `core` | Hạ tầng dùng chung: Prisma, băm mật khẩu… (re-export từ `src/lib`) | — |
| `identity` | Tài khoản giáo viên, học sinh; phiên đăng nhập của cổng `/teacher`, `/learn` | `core` |
| `center` | Lớp, học sinh, ghi danh (phần mới; phần cũ còn ở `src/lib`) | `core` |
| `learning` | Bài giao, từ vựng, tài liệu | `core`, `identity`, `center` |

## Quy tắc

1. Bên ngoài một module chỉ import `@/modules/<tên>`, tức `index.ts`, không import file bên trong.
2. Module chỉ phụ thuộc module có trong bảng trên; không có vòng phụ thuộc.
3. Chỉ `core` được import `src/lib/*`. Module khác lấy hạ tầng qua `@/modules/core`.
4. Module không import giao diện trong `src/app`. Trang và route gọi xuống module, không ngược lại.
5. Mỗi module sở hữu bảng của mình: module khác muốn đọc thì gọi hàm module đó export.

Quy tắc 1–4 được kiểm tra bằng `tests/module-boundaries.test.ts` (chạy trong `npm test`).
Quy tắc 5 dựa vào review.

## Thêm module

1. Khai báo tên và các phụ thuộc trong `MODULE_DEPENDENCIES` (`tests/helpers/module-boundaries.ts`)
   và trong bảng trên.
2. Tạo `src/modules/<tên>/index.ts` export đúng những gì module khác được dùng.
