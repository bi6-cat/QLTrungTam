/** Thứ theo ISO-8601: 1 = Thứ 2 … 7 = Chủ nhật. */
export const WEEKDAYS = [
  { value: 1, label: "Thứ 2", short: "T2" },
  { value: 2, label: "Thứ 3", short: "T3" },
  { value: 3, label: "Thứ 4", short: "T4" },
  { value: 4, label: "Thứ 5", short: "T5" },
  { value: 5, label: "Thứ 6", short: "T6" },
  { value: 6, label: "Thứ 7", short: "T7" },
  { value: 7, label: "Chủ nhật", short: "CN" }
] as const;

export function weekdayLabel(weekday: number) {
  return WEEKDAYS.find((day) => day.value === weekday)?.label ?? `Thứ ${weekday}`;
}

export function weekdayShort(weekday: number) {
  return WEEKDAYS.find((day) => day.value === weekday)?.short ?? String(weekday);
}

/** `Date.getDay()` trả 0 cho Chủ nhật; quy về ISO 1..7. */
export function isoWeekday(date: Date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/** Số lần mỗi thứ xuất hiện trong tháng, index theo ISO 1..7. */
export function weekdayOccurrencesInMonth(month: number, year: number) {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    counts[isoWeekday(new Date(year, month - 1, day))] += 1;
  }
  return counts;
}

/**
 * Số buổi dạy thực tế của một lớp trong tháng, suy từ lịch học cố định.
 * Trả về null khi lớp chưa xếp lịch để nơi gọi tự quyết định giá trị thay thế.
 */
export function countScheduledSessions(
  schedules: Array<{ weekday: number }>,
  month: number,
  year: number
) {
  if (schedules.length === 0) return null;
  const occurrences = weekdayOccurrencesInMonth(month, year);
  return schedules.reduce((sum, slot) => sum + (occurrences[slot.weekday] ?? 0), 0);
}

/** Sắp xếp buổi học theo thứ rồi tới giờ bắt đầu. */
export function sortSchedules<T extends { weekday: number; startTime: string }>(slots: T[]) {
  return [...slots].sort(
    (left, right) => left.weekday - right.weekday || left.startTime.localeCompare(right.startTime)
  );
}

export const EXPENSE_CATEGORIES = [
  { value: "teacher_salary", label: "Lương giáo viên" },
  { value: "rent", label: "Thuê mặt bằng" },
  { value: "utilities", label: "Điện nước / Internet" },
  { value: "supplies", label: "Văn phòng phẩm / tài liệu" },
  { value: "marketing", label: "Quảng cáo / tuyển sinh" },
  { value: "other", label: "Khác" }
] as const;

export type ExpenseCategoryValue = (typeof EXPENSE_CATEGORIES)[number]["value"];

export function expenseCategoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((item) => item.value === value)?.label ?? "Khác";
}
