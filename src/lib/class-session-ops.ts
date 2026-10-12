import { Prisma, type PrismaClient } from "@prisma/client";
import {
  addDays,
  buildCalendar,
  effectiveRangesOverlap,
  formatIsoDayMonth,
  isoParts,
  isoToDbDate,
  slotActiveOn,
  todayInVietnam,
  type IsoDate
} from "@/lib/class-sessions";
import { scheduleSlotSelect, sessionRecordSelect, toScheduleSlot, toSessionRecord } from "@/lib/class-sessions-server";

// Nghiệp vụ lịch cố định + điểm danh, tách khỏi server action để test tích hợp gọi thẳng được.

type Db = PrismaClient | Prisma.TransactionClient;

async function requireActiveClass(db: Db, classId: string) {
  const classRoom = await db.classRoom.findUnique({ where: { id: classId }, select: { name: true, archivedAt: true } });
  if (!classRoom) throw new Error("Không tìm thấy lớp học.");
  if (classRoom.archivedAt) throw new Error("Lớp đã lưu trữ, không thể sửa lịch hay điểm danh.");
  return classRoom;
}

async function assertNoOverlappingSlot(
  db: Db,
  slot: { id?: string; classId: string; weekday: number; startTime: string; effectiveFrom: IsoDate | null; effectiveTo: IsoDate | null }
) {
  const siblings = await db.classSchedule.findMany({
    where: { classId: slot.classId, weekday: slot.weekday, startTime: slot.startTime, ...(slot.id ? { id: { not: slot.id } } : {}) },
    select: scheduleSlotSelect
  });
  if (siblings.map(toScheduleSlot).some((sibling) => effectiveRangesOverlap(sibling, slot))) {
    throw new Error("Lớp này đã có buổi học trùng thứ và giờ bắt đầu.");
  }
}

export async function createScheduleSlot(
  db: Db,
  input: {
    classId: string;
    weekday: number;
    startTime: string;
    endTime: string;
    room: string;
    note: string | null;
    effectiveFrom: IsoDate | null;
  }
) {
  if (input.endTime <= input.startTime) throw new Error("Giờ kết thúc phải sau giờ bắt đầu.");
  const classRoom = await requireActiveClass(db, input.classId);
  await assertNoOverlappingSlot(db, { ...input, effectiveTo: null });
  await db.classSchedule.create({
    data: {
      classId: input.classId,
      weekday: input.weekday,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room,
      note: input.note,
      effectiveFrom: input.effectiveFrom ? isoToDbDate(input.effectiveFrom) : null
    }
  });
  return classRoom;
}

/** Sửa giờ/thứ/phòng của lịch cố định. Buổi đã điểm danh giữ nguyên giờ đã ghi. */
export async function updateScheduleSlot(
  db: Db,
  input: { id: string; weekday: number; startTime: string; endTime: string; room: string }
) {
  if (input.endTime <= input.startTime) throw new Error("Giờ kết thúc phải sau giờ bắt đầu.");
  const existing = await db.classSchedule.findUnique({ where: { id: input.id }, select: scheduleSlotSelect });
  if (!existing) throw new Error("Lịch học không còn tồn tại. Vui lòng tải lại trang.");
  await requireActiveClass(db, existing.classId);
  const slot = toScheduleSlot(existing);
  await assertNoOverlappingSlot(db, { ...slot, ...input });
  await db.classSchedule.update({
    where: { id: input.id },
    data: { weekday: input.weekday, startTime: input.startTime, endTime: input.endTime, room: input.room }
  });
}

/**
 * Ngừng lịch cố định từ một ngày: đóng khoảng hiệu lực để các buổi trước đó vẫn còn trên thời
 * khóa biểu. Lịch chưa từng có buổi nào trước ngày đó thì xóa hẳn.
 */
export async function stopScheduleSlot(db: Db, input: { id: string; fromDate: IsoDate }) {
  const existing = await db.classSchedule.findUnique({ where: { id: input.id }, select: scheduleSlotSelect });
  if (!existing) throw new Error("Lịch học không còn tồn tại. Vui lòng tải lại trang.");
  const slot = toScheduleSlot(existing);
  const effectiveTo = addDays(input.fromDate, -1);
  if (slot.effectiveFrom && effectiveTo < slot.effectiveFrom) {
    await db.classSchedule.delete({ where: { id: input.id } });
    return "deleted" as const;
  }
  await db.classSchedule.update({ where: { id: input.id }, data: { effectiveTo: isoToDbDate(effectiveTo) } });
  return "stopped" as const;
}

/** Buổi theo lịch (hoặc buổi đã điểm danh) của lớp tại ngày + giờ bắt đầu; không có thì báo lỗi. */
async function findSession(db: Db, classId: string, date: IsoDate, startTime: string) {
  const [slots, record] = await Promise.all([
    db.classSchedule.findMany({ where: { classId, startTime }, select: scheduleSlotSelect }),
    db.classSession.findUnique({
      where: { classId_date_startTime: { classId, date: isoToDbDate(date), startTime } },
      select: sessionRecordSelect
    })
  ]);
  const slot = slots.map(toScheduleSlot).find((item) => slotActiveOn(item, date));
  if (!slot && !record) {
    throw new Error(`Lớp không có buổi học lúc ${startTime} ngày ${formatIsoDayMonth(date)}. Vui lòng tải lại trang.`);
  }
  return { slot, record: record ? toSessionRecord(record) : null };
}

/** Cảnh báo khi buổi nghỉ/học bù rơi vào tháng mà hóa đơn tháng sau đã tạo (không tự trừ nữa). */
async function nextMonthInvoiceWarning(db: Db, classIds: string[], date: IsoDate) {
  const { month, year } = isoParts(date);
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  const issued = await db.monthlyInvoice.count({
    where: { month: next.month, year: next.year, status: { in: ["unpaid", "paid"] }, enrollment: { classId: { in: classIds } } }
  });
  return issued > 0
    ? ` Hóa đơn T${next.month}/${next.year} đã tạo nên số buổi không tự điều chỉnh, hãy sửa tay ở trang Lớp học nếu cần.`
    : "";
}

export async function markSession(
  db: Db,
  input: { classId: string; date: IsoDate; startTime: string; status: "held" | "cancelled"; reason: string | null },
  markedBy: string
) {
  await requireActiveClass(db, input.classId);
  const { slot, record } = await findSession(db, input.classId, input.date, input.startTime);
  if (record?.status === "makeup") throw new Error("Đây là buổi học bù. Muốn hủy thì bấm Xóa buổi bù.");
  if (input.status === "held" && input.date > todayInVietnam()) {
    throw new Error("Chưa tới ngày học, chưa điểm danh được.");
  }
  const reason = input.status === "cancelled" ? input.reason : null;
  await db.classSession.upsert({
    where: { classId_date_startTime: { classId: input.classId, date: isoToDbDate(input.date), startTime: input.startTime } },
    update: { status: input.status, reason, markedBy },
    create: {
      classId: input.classId,
      date: isoToDbDate(input.date),
      startTime: input.startTime,
      endTime: record?.endTime ?? slot!.endTime,
      room: record?.room ?? slot!.room,
      status: input.status,
      reason,
      markedBy
    }
  });
  return input.status === "cancelled" ? nextMonthInvoiceWarning(db, [input.classId], input.date) : "";
}

/** Bỏ điểm danh (buổi theo lịch về "chưa điểm danh") hoặc xóa buổi học bù. */
export async function clearSession(db: Db, recordId: string) {
  const deleted = await db.classSession.deleteMany({ where: { id: recordId } });
  if (deleted.count !== 1) throw new Error("Buổi học đã thay đổi. Vui lòng tải lại trang.");
}

/** Thêm buổi học bù; có buổi gốc thì đây là "dời buổi": buổi gốc ghi là lớp nghỉ. */
export async function addMakeupSession(
  db: Db,
  input: {
    classId: string;
    date: IsoDate;
    startTime: string;
    endTime: string;
    room: string;
    reason: string | null;
    fromDate?: IsoDate;
    fromStartTime?: string;
  },
  markedBy: string
) {
  if (input.endTime <= input.startTime) throw new Error("Giờ kết thúc phải sau giờ bắt đầu.");
  await requireActiveClass(db, input.classId);

  const slots = (await db.classSchedule.findMany({ where: { classId: input.classId }, select: scheduleSlotSelect })).map(toScheduleSlot);
  if (slots.some((slot) => slot.startTime === input.startTime && slotActiveOn(slot, input.date))) {
    throw new Error(`Lớp đã có buổi theo lịch lúc ${input.startTime} ngày ${formatIsoDayMonth(input.date)}.`);
  }

  if (input.fromDate && input.fromStartTime) {
    if (input.fromDate === input.date && input.fromStartTime === input.startTime) {
      throw new Error("Ngày giờ học bù phải khác buổi gốc.");
    }
    const { slot, record } = await findSession(db, input.classId, input.fromDate, input.fromStartTime);
    if (record?.status === "makeup") throw new Error("Buổi học bù không dời tiếp được; hãy xóa rồi thêm buổi bù mới.");
    const reason = input.reason ? `${input.reason} – bù ${formatIsoDayMonth(input.date)}` : `Dời sang ${formatIsoDayMonth(input.date)}`;
    await db.classSession.upsert({
      where: {
        classId_date_startTime: { classId: input.classId, date: isoToDbDate(input.fromDate), startTime: input.fromStartTime }
      },
      update: { status: "cancelled", reason, markedBy },
      create: {
        classId: input.classId,
        date: isoToDbDate(input.fromDate),
        startTime: input.fromStartTime,
        endTime: record?.endTime ?? slot!.endTime,
        room: record?.room ?? slot!.room,
        status: "cancelled",
        reason,
        markedBy
      }
    });
  }

  try {
    await db.classSession.create({
      data: {
        classId: input.classId,
        date: isoToDbDate(input.date),
        startTime: input.startTime,
        endTime: input.endTime,
        room: input.room,
        status: "makeup",
        reason: input.fromDate ? `Bù buổi ${formatIsoDayMonth(input.fromDate)}` : input.reason,
        makeupForDate: input.fromDate ? isoToDbDate(input.fromDate) : null,
        markedBy
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error(`Lớp đã có buổi lúc ${input.startTime} ngày ${formatIsoDayMonth(input.date)}.`);
    }
    throw error;
  }

  const dates = [input.date, ...(input.fromDate ? [input.fromDate] : [])];
  const warnings = await Promise.all(dates.map((date) => nextMonthInvoiceWarning(db, [input.classId], date)));
  return warnings.find(Boolean) ?? "";
}

/** Ghi "đã học" cho mọi buổi theo lịch chưa điểm danh trong khoảng ngày (tới hôm nay). */
export async function markPendingSessionsHeld(
  db: Db,
  input: { from: IsoDate; to: IsoDate; classId?: string },
  markedBy: string
) {
  const today = todayInVietnam();
  const to = input.to < today ? input.to : today;
  if (to < input.from) return 0;
  const classFilter = { archivedAt: null, ...(input.classId ? { id: input.classId } : {}) };
  const [slots, records] = await Promise.all([
    db.classSchedule.findMany({ where: { classRoom: classFilter }, select: scheduleSlotSelect }),
    db.classSession.findMany({
      where: { classRoom: classFilter, date: { gte: isoToDbDate(input.from), lte: isoToDbDate(to) } },
      select: sessionRecordSelect
    })
  ]);
  const calendar = buildCalendar({
    slots: slots.map(toScheduleSlot),
    records: records.map(toSessionRecord),
    from: input.from,
    to,
    today
  });
  // Buổi hôm nay chưa qua nên ở trạng thái "upcoming"; bấm điểm danh hàng loạt thì tính luôn.
  const unmarked = calendar.filter((session) => session.scheduled && !session.recordId);
  if (unmarked.length === 0) return 0;
  const created = await db.classSession.createMany({
    data: unmarked.map((session) => ({
      classId: session.classId,
      date: isoToDbDate(session.date),
      startTime: session.startTime,
      endTime: session.endTime,
      room: session.room,
      status: "held" as const,
      markedBy
    })),
    skipDuplicates: true
  });
  return created.count;
}

/** Nghỉ cả ngày (lễ, sự cố…): mọi buổi theo lịch của các lớp đang hoạt động ghi là lớp nghỉ. */
export async function cancelDay(db: Db, input: { date: IsoDate; reason: string }, markedBy: string) {
  const slots = (
    await db.classSchedule.findMany({ where: { classRoom: { archivedAt: null } }, select: scheduleSlotSelect })
  )
    .map(toScheduleSlot)
    .filter((slot) => slotActiveOn(slot, input.date));
  const existing = await db.classSession.findMany({
    where: { date: isoToDbDate(input.date), classId: { in: slots.map((slot) => slot.classId) } },
    select: { classId: true, startTime: true, status: true }
  });
  const makeups = new Set(
    existing.filter((record) => record.status === "makeup").map((record) => `${record.classId}|${record.startTime}`)
  );
  const seen = new Set<string>();
  let count = 0;
  for (const slot of slots) {
    const key = `${slot.classId}|${slot.startTime}`;
    if (seen.has(key) || makeups.has(key)) continue;
    seen.add(key);
    await db.classSession.upsert({
      where: { classId_date_startTime: { classId: slot.classId, date: isoToDbDate(input.date), startTime: slot.startTime } },
      update: { status: "cancelled", reason: input.reason, markedBy },
      create: {
        classId: slot.classId,
        date: isoToDbDate(input.date),
        startTime: slot.startTime,
        endTime: slot.endTime,
        room: slot.room,
        status: "cancelled",
        reason: input.reason,
        markedBy
      }
    });
    count += 1;
  }
  const warning = count > 0 ? await nextMonthInvoiceWarning(db, [...new Set(slots.map((slot) => slot.classId))], input.date) : "";
  return { count, warning };
}
