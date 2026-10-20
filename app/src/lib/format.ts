export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatMonth(month: number, year: number) {
  return `Tháng ${month}/${year}`;
}

export function formatEnrollmentStatus(status: "active" | "on_leave") {
  return status === "active" ? "Đang học" : "Bảo lưu";
}


export function toInt(value: FormDataEntryValue | null, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toText(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}
