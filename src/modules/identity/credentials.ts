import { randomInt } from "crypto";

export const PIN_LENGTH = 6;
const MAX_CODE_BASE = 20;

/**
 * Phần chữ của mã học sinh: tên không dấu + chữ cái đầu của họ và tên đệm.
 * "Nguyễn Văn Hương" → "HuongNV", "Lê Thị Đào" → "DaoLT". Tên trống → "HocSinh".
 */
export function studentCodeBase(fullName: string) {
  // Bỏ ghi chú trong ngoặc và cụm có chữ số ("Ngô Thị Ánh (12A)", "Vũ Minh 2") để chúng không thành tên.
  const words = fullName
    .replace(/\([^)]*\)/g, " ")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter((word) => !/\d/.test(word))
    .map((word) => word.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (words.length === 0) return "HocSinh";
  const given = words.at(-1)!;
  const initials = words
    .slice(0, -1)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (given[0].toUpperCase() + given.slice(1).toLowerCase() + initials).slice(0, MAX_CODE_BASE);
}

/** "HuongNV" + 2 → "HuongNV02"; từ 100 trở đi thì đủ ba chữ số. */
export function formatStudentCode(base: string, n: number) {
  return `${base}${String(n).padStart(2, "0")}`;
}

/** Số nhỏ nhất (từ 1) chưa có trong các mã đã cấp cùng phần chữ (so không phân biệt hoa thường). */
export function nextStudentCodeNumber(base: string, existingCodes: Iterable<string>) {
  const pattern = new RegExp(`^${base}(\\d{2,})$`, "i");
  const used = new Set<number>();
  for (const code of existingCodes) {
    const match = pattern.exec(code);
    if (match) used.add(Number(match[1]));
  }
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

/**
 * Mã học sinh gõ vào → khoá tra cứu (viết thường, bỏ khoảng trắng/gạch); null nếu không thể là mã.
 * Nhận cả mã mới ("HuongNV02") lẫn mã ngẫu nhiên 6 ký tự của tài khoản cũ.
 */
export function studentCodeKey(input: string) {
  const code = input.replace(/[\s-]/g, "").toLowerCase();
  return /^[a-z0-9]{4,24}$/.test(code) ? code : null;
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
