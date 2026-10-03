/**
 * Tìm và xếp tên học sinh cho trang nộp học phí: gõ không dấu vẫn tìm được, xếp theo TÊN (chữ
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

function givenName(fullName: string) {
  const words = normalizeName(fullName).split(" ");
  return words[words.length - 1] ?? "";
}

const collator = new Intl.Collator("vi");

/** Xếp theo tên rồi đến họ tên đầy đủ. */
export function sortByGivenName<T extends { fullName: string }>(students: T[]) {
  return [...students].sort(
    (a, b) =>
      collator.compare(givenName(a.fullName), givenName(b.fullName)) || collator.compare(a.fullName, b.fullName)
  );
}

/** Mọi từ gõ vào đều phải xuất hiện trong tên (không phân biệt dấu, hoa thường, thứ tự). */
export function matchesName(fullName: string, query: string) {
  const name = normalizeName(fullName);
  const words = normalizeName(query).split(" ").filter(Boolean);
  return words.every((word) => name.includes(word));
}
