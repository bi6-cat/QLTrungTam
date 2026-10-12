/** Trang cần hiện: đầu, cuối, quanh trang hiện tại; khoảng trống thành "…". */
export function pageItems(page: number, totalPages: number): Array<number | "gap"> {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((value) => pages.add(value));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((value) => pages.add(value));
  const sorted = [...pages].filter((value) => value >= 1 && value <= totalPages).sort((left, right) => left - right);
  const items: Array<number | "gap"> = [];
  for (const value of sorted) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && value - previous > 1) items.push(value - previous === 2 ? value - 1 : "gap");
    items.push(value);
  }
  return items;
}
