import { randomInt } from "crypto";

// Bảng chữ không gây nhầm lẫn khi đọc/nhập tay (bỏ 0 O 1 I l) — 31 ký tự.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// Độ dài mã link công khai (dùng cho /pay/<token> và /teacher/classes/<token>).
// Ngắn để dễ gửi Zalo. Lưu ý: mã càng ngắn càng dễ bị dò — trang công khai lộ
// tên/SĐT/học phí học sinh, cân nhắc trước khi giảm thêm.
export const PUBLIC_TOKEN_LENGTH = 4;

export function generatePublicToken(length = PUBLIC_TOKEN_LENGTH) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}
