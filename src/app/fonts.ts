import { Be_Vietnam_Pro, Patrick_Hand } from "next/font/google";

// Font cho các trang công khai (trang chủ, khảo sát): sans hiện đại, thiết kế riêng cho tiếng Việt.
// Khu quản trị vẫn dùng Inter.
export const publicFont = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-display"
});

// Chữ viết tay cho ghi chú, sticker trên trang chủ.
export const handFont = Patrick_Hand({
  subsets: ["latin", "vietnamese"],
  weight: "400",
  display: "swap",
  variable: "--font-hand"
});
