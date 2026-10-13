import { Newsreader } from "next/font/google";

// Font serif cho tiêu đề các trang công khai (trang chủ, khảo sát); khu quản trị vẫn dùng Inter.
export const displayFont = Newsreader({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display"
});
