# Ảnh chân dung giáo viên

Thư mục này chứa ảnh giáo viên hiển thị ở phần **"Đội ngũ giáo viên"** trên trang chủ (landing page).

## Cách thêm ảnh

1. Chép ảnh vào thư mục này, ví dụ: `public/teachers/co-huong.jpg`
2. Mở `src/app/page.tsx`, tìm phần `TEACHER_PROFILES`
3. Điền đường dẫn ảnh (bắt đầu bằng `/teachers/...`, KHÔNG có chữ `public`):

   ```ts
   "Cô Hương": {
     bio: "Trên 5 năm kinh nghiệm giảng dạy Ngữ văn.",
     photo: "/teachers/co-huong.jpg"
   },
   ```

   > Key (`"Cô Hương"`) phải **trùng đúng** tên giáo viên khai trong `COURSES` (cùng file `page.tsx`).
   > Nếu để `photo: ""` thì hệ thống tự dùng avatar chữ viết tắt.

## Gợi ý về ảnh

- **Tỉ lệ vuông (1:1)** — ảnh hiển thị trong khung 64×64px, bo góc. Ảnh không vuông sẽ bị cắt phần thừa.
- Kích thước đề xuất: khoảng **300×300px trở lên** cho nét trên màn hình retina.
- Định dạng: `.jpg`, `.png` hoặc `.webp`. Nên tối ưu dung lượng (< 200KB) cho tải nhanh.
- Đặt tên file không dấu, không khoảng trắng, ví dụ: `co-lan.jpg`, `thay-son.webp`.

## Danh sách giáo viên hiện có

Điền ảnh cho các key sau (trong `TEACHER_PROFILES`):

- Cô Hương (Ngữ văn 9)
- Cô Lệ (Tiếng Anh 9)
- Cô Hằng (Toán 12)
- Thầy Thắng (Tiếng Anh 10)
- Cô Hoan (Lịch sử 12)
