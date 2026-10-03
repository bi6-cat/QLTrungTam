import { randomInt } from "crypto";

// Bảng chữ không gây nhầm lẫn khi đọc/nhập tay (bỏ 0 O 1 I l) — 31 ký tự.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// Phần ngẫu nhiên của link nộp tiền (/pay/<MÃ LỚP>-<mã>). Trang này lộ tên học sinh
// và học phí nên mã phải đủ dài để không dò được: 31^10 ≈ 8×10^14 khả năng.
export const PUBLIC_TOKEN_LENGTH = 10;

// Link giáo viên xem được cả lớp ở mọi tháng nên dài hơn link phụ huynh.
export const TEACHER_TOKEN_LENGTH = 16;

export function generatePublicToken(length = PUBLIC_TOKEN_LENGTH) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
