export function formatCurrency(amount: number) {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0
  }).format(amount);
}

// vi-VN với chỉ ngày/tháng in ra "01-10"; en-GB cho đúng dạng "01/10" quen thuộc.
const dayMonthFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});

/** Ngày/tháng ngắn theo giờ Việt Nam, vd "05/10". */
export function formatDayMonth(date: Date) {
  return dayMonthFormat.format(date);
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
