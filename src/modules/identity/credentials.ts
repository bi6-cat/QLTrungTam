import { randomInt } from "crypto";

// Bỏ các ký tự dễ nhầm khi đọc/gõ (0/O, 1/I/L) vì học sinh nhỏ tự gõ mã từ giấy phát.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const STUDENT_CODE_LENGTH = 6;
export const PIN_LENGTH = 6;

/** Mã đăng nhập ngẫu nhiên (31^6 ≈ 887 triệu khả năng), không suy ra được mã của bạn khác. */
export function generateStudentCode() {
  let code = "";
  for (let i = 0; i < STUDENT_CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** Mã học sinh gõ vào: bỏ khoảng trắng/gạch, chữ hoa; null nếu không thể là mã hợp lệ. */
export function normalizeStudentCode(input: string) {
  const code = input.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== STUDENT_CODE_LENGTH) return null;
  for (const char of code) if (!CODE_ALPHABET.includes(char)) return null;
  return code;
}

export function isValidPin(pin: string) {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

/** PIN dễ đoán: toàn một chữ số (111111) hoặc dãy liên tiếp (123456, 987654). */
export function isWeakPin(pin: string) {
  if (/^(\d)\1+$/.test(pin)) return true;
  const steps = new Set<number>();
  for (let i = 1; i < pin.length; i++) steps.add(Number(pin[i]) - Number(pin[i - 1]));
  return steps.size === 1 && (steps.has(1) || steps.has(-1));
}

export function generatePin() {
  for (;;) {
    const pin = String(randomInt(10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
    if (!isWeakPin(pin)) return pin;
  }
}
