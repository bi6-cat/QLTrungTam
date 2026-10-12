/**
 * Tìm và xếp tên học sinh (dùng cho mọi danh sách học sinh): gõ không dấu vẫn tìm được, xếp theo TÊN (chữ
 * cuối) như thói quen gọi tên ở Việt Nam thay vì theo họ (lớp nào cũng nhiều "Nguyễn").
 */

export function normalizeName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const collator = new Intl.Collator("vi");

/**
 * Thứ tự chuẩn của MỌI danh sách học sinh trong app: theo tên (chữ cuối) rồi đến họ tên đầy đủ,
 * như danh sách lớp ở Việt Nam.
 */
export function compareStudentNames(left: string, right: string) {
  // So tên còn dấu: collator "vi" xếp đúng bảng chữ cái (D trước Đ, a trước ă, â).
  return collator.compare(lastWord(left), lastWord(right)) || collator.compare(left, right);
}

function lastWord(fullName: string) {
  const words = fullName.trim().split(/\s+/);
  return words[words.length - 1] ?? "";
}

/** Xếp theo tên rồi đến họ tên đầy đủ. */
export function sortByGivenName<T extends { fullName: string }>(students: T[]) {
  return [...students].sort((a, b) => compareStudentNames(a.fullName, b.fullName));
}

/** Mọi từ gõ vào đều phải xuất hiện trong tên (không phân biệt dấu, hoa thường, thứ tự). */
export function matchesName(fullName: string, query: string) {
  const name = normalizeName(fullName);
  const words = normalizeName(query).split(" ").filter(Boolean);
  return words.every((word) => name.includes(word));
}
