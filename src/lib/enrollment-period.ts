import type { Prisma } from "@prisma/client";
import { isoWeekday } from "@/lib/schedule";

export function periodStartDate(month: number, year: number) {
  return new Date(year, month - 1, 1);
}

/** Chỉ số tháng tăng dần để so sánh kỳ: (năm, tháng) → số nguyên. */
export function periodIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

/** Học sinh còn học lớp trong kỳ: chưa nghỉ, hoặc nghỉ từ một tháng sau kỳ này. */
export function isEnrollmentActiveInPeriod(leftAt: Date | null, month: number, year: number) {
  return !leftAt || leftAt.getTime() > periodStartDate(month, year).getTime();
}

/**
 * Điều kiện ghi danh hiện trong danh sách lớp của một kỳ.
 *
 * Học sinh đã nghỉ lớp hoặc đã lưu trữ chỉ còn hiện ở kỳ có hóa đơn chưa đóng/đã đóng
 * (tiền vẫn phải theo dõi); kỳ chỉ còn dữ liệu kế hoạch hoặc hóa đơn đã hủy thì ẩn ngay,
 * không đợi hết tháng.
 */
export function enrollmentVisibleInPeriodWhere(month: number, year: number): Prisma.EnrollmentWhereInput {
  const periodEnd = new Date(year, month, 1);
  const hasPeriodData: Prisma.EnrollmentWhereInput[] = [
    { months: { some: { month, year } } },
    { invoices: { some: { month, year } } }
  ];
  const hasBilledInvoice: Prisma.EnrollmentWhereInput = {
    invoices: { some: { month, year, status: { in: ["paid", "unpaid"] } } }
  };

  return {
    AND: [
      { OR: [{ createdAt: { lt: periodEnd } }, ...hasPeriodData] },
      { OR: [{ student: { archivedAt: null } }, hasBilledInvoice] },
      { OR: [{ leftAt: null }, { leftAt: { gt: periodStartDate(month, year) } }, hasBilledInvoice] }
    ]
  };
}

/**
 * Số buổi theo lịch cố định từ ngày vào lớp tới hết tháng, dùng để gợi ý khi học sinh
 * vào giữa tháng. Null khi lớp chưa xếp lịch hoặc ngày vào lớp không thuộc kỳ.
 */
export function remainingScheduledSessions(
  schedules: Array<{ weekday: number }>,
  joinedAt: Date,
  month: number,
  year: number
) {
  if (schedules.length === 0) return null;
  if (joinedAt.getFullYear() !== year || joinedAt.getMonth() + 1 !== month) return null;

  const weekdays = schedules.map((slot) => slot.weekday);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let day = joinedAt.getDate(); day <= daysInMonth; day += 1) {
    const weekday = isoWeekday(new Date(year, month - 1, day));
    count += weekdays.filter((value) => value === weekday).length;
  }
  return count;
}
