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

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});

/** Giờ và ngày theo giờ Việt Nam, vd "20:00 05/11". */
export function formatTimeDay(date: Date) {
  const parts = Object.fromEntries(dateTimeFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
}

/** Ô datetime-local ("2026-11-05T20:00", hiểu là giờ Việt Nam) → Date; null nếu trống hoặc sai. */
export function parseVietnamDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
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
