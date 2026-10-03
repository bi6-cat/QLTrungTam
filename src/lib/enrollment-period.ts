import type { EnrollmentStatus, Prisma } from "@prisma/client";
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
      { OR: [{ startDate: { lt: periodEnd } }, ...hasPeriodData] },
      { OR: [{ student: { archivedAt: null } }, hasBilledInvoice] },
      { OR: [{ leftAt: null }, { leftAt: { gt: periodStartDate(month, year) } }, hasBilledInvoice] }
    ]
  };
}

/**
 * Lấy kế hoạch tháng gần nhất tính đến kỳ đang xem (dùng trong `include.months`): trùng kỳ thì
 * là kế hoạch của chính kỳ đó, không thì là tháng gần nhất trước đó để kế thừa tình trạng học.
 */
export function latestMonthUpToPeriodArgs(month: number, year: number) {
  return {
    where: { OR: [{ year: { lt: year } }, { year, month: { lte: month } }] },
    orderBy: [{ year: "desc" as const }, { month: "desc" as const }],
    take: 1
  };
}

export type MonthPlanRecord = {
  month: number;
  year: number;
  status: EnrollmentStatus;
  sessions: number;
  pricePerSession: number;
};

/**
 * Kế hoạch học của một học sinh trong một kỳ.
 *
 * - Kỳ đã có kế hoạch hoặc hóa đơn: dùng đúng dữ liệu đó.
 * - Kỳ mới: tình trạng học lấy theo tháng gần nhất trước đó (chưa có thì theo lúc thêm vào lớp),
 *   số buổi về mặc định đã khai (buổi riêng của học sinh, không có thì của lớp), đơn giá theo lớp.
 */
export function resolveMonthPlan(input: {
  month: number;
  year: number;
  latestMonth?: MonthPlanRecord | null;
  invoice?: { sessions: number; pricePerSession: number } | null;
  enrollment: { status: EnrollmentStatus; sessionsOverride: number | null };
  classRoom: { sessionsPerMonthDefault: number; pricePerSession: number };
}) {
  const { latestMonth, invoice, enrollment, classRoom } = input;
  const current =
    latestMonth && latestMonth.month === input.month && latestMonth.year === input.year ? latestMonth : null;
  const defaultSessions = enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
  const status: EnrollmentStatus =
    current?.status ?? (invoice ? "active" : latestMonth?.status ?? enrollment.status);
  return {
    status,
    sessions: invoice?.sessions ?? current?.sessions ?? (status === "active" ? defaultSessions : 0),
    pricePerSession: invoice?.pricePerSession ?? current?.pricePerSession ?? classRoom.pricePerSession,
    defaultSessions,
    initialized: Boolean(current || invoice)
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
