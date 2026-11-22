import type { Prisma, PrismaClient } from "@prisma/client";
import {
  countScheduledInRange,
  isoFromDbDate,
  isoToDbDate,
  monthRange,
  suggestSessions,
  type ScheduleSlot,
  type SessionAdjustment,
  type SessionRecord,
  type SessionSuggestion
} from "@/lib/class-sessions";

type Db = PrismaClient | Prisma.TransactionClient;

export const scheduleSlotSelect = {
  id: true,
  classId: true,
  weekday: true,
  startTime: true,
  endTime: true,
  room: true,
  effectiveFrom: true,
  effectiveTo: true
} as const;

export const sessionRecordSelect = {
  id: true,
  classId: true,
  date: true,
  startTime: true,
  endTime: true,
  room: true,
  status: true,
  reason: true
} as const;

export function toScheduleSlot(row: {
  id: string;
  classId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}): ScheduleSlot {
  return {
    ...row,
    effectiveFrom: row.effectiveFrom ? isoFromDbDate(row.effectiveFrom) : null,
    effectiveTo: row.effectiveTo ? isoFromDbDate(row.effectiveTo) : null
  };
}

export function toSessionRecord(row: {
  id: string;
  classId: string;
  date: Date;
  startTime: string;
  endTime: string;
  room: string;
  status: SessionRecord["status"];
  reason: string | null;
}): SessionRecord {
  return { ...row, date: isoFromDbDate(row.date) };
}

/** Số buổi theo lịch tháng M và các buổi nghỉ / học bù trong chính tháng M của một lớp. */
export async function loadSessionAdjustment(db: Db, classId: string, month: number, year: number): Promise<SessionAdjustment> {
  const range = monthRange(month, year);
  const [slots, records] = await Promise.all([
    db.classSchedule.findMany({ where: { classId }, select: scheduleSlotSelect }),
    db.classSession.findMany({
      where: {
        classId,
        status: { in: ["cancelled", "makeup"] },
        date: { gte: isoToDbDate(range.from), lte: isoToDbDate(range.to) }
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      select: { date: true, status: true, reason: true, makeupForDate: true }
    })
  ]);
  const scheduled = countScheduledInRange(slots.map(toScheduleSlot), range.from, range.to);
  const pick = (status: "cancelled" | "makeup") =>
    records
      .filter((record) => record.status === status)
      .map((record) => ({
        date: isoFromDbDate(record.date),
        reason: record.reason,
        makeupFor: record.makeupForDate ? isoFromDbDate(record.makeupForDate) : null
      }));
  return { month, year, scheduled: scheduled > 0 ? scheduled : null, cancelled: pick("cancelled"), makeups: pick("makeup") };
}

/**
 * Gợi ý số buổi tháng M cho từng ghi danh của một lớp (chỉ dùng cho kỳ chưa khởi tạo; kỳ đã có
 * kế hoạch/hóa đơn giữ nguyên số đã chốt). Học sinh vào giữa tháng: admin sửa tay.
 */
export async function loadSessionSuggestions(
  db: Db,
  input: {
    classRoom: { id: string; sessionsPerMonthDefault: number };
    month: number;
    year: number;
    enrollments: Array<{ id: string; sessionsOverride: number | null }>;
  }
) {
  const adjustment = await loadSessionAdjustment(db, input.classRoom.id, input.month, input.year);
  const byEnrollment = new Map<string, SessionSuggestion>();
  for (const enrollment of input.enrollments) {
    byEnrollment.set(
      enrollment.id,
      suggestSessions({
        adjustment,
        classDefault: input.classRoom.sessionsPerMonthDefault,
        sessionsOverride: enrollment.sessionsOverride
      })
    );
  }
  return { adjustment, byEnrollment };
}
