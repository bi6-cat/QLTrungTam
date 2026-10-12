// Thời khóa biểu theo ngày + điểm danh buổi học của lớp. File thuần (không prisma) để test được.
//
// Ngày luôn là chuỗi "YYYY-MM-DD" theo giờ Việt Nam; cột @db.Date của Postgres đọc ra là
// Date lúc 0h UTC nên đổi qua lại bằng isoFromDbDate / isoToDbDate.

export type IsoDate = string;

export type ScheduleSlot = {
  id: string;
  classId: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string;
  effectiveFrom: IsoDate | null;
  effectiveTo: IsoDate | null;
};

export type SessionRecordStatus = "held" | "cancelled" | "makeup";

export type SessionRecord = {
  id: string;
  classId: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  room: string;
  status: SessionRecordStatus;
  reason: string | null;
};

/** pending = đã qua mà chưa điểm danh; upcoming = hôm nay hoặc sắp tới, chưa điểm danh. */
export type CalendarStatus = SessionRecordStatus | "pending" | "upcoming";

export type CalendarSession = {
  key: string;
  classId: string;
  date: IsoDate;
  startTime: string;
  endTime: string;
  room: string;
  /** Có lịch cố định ứng với buổi này (buổi học bù hoặc buổi của lịch cũ đã đổi giờ thì không). */
  scheduled: boolean;
  recordId: string | null;
  status: CalendarStatus;
  reason: string | null;
};

const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string | null | undefined): IsoDate | null {
  const match = ISO_PATTERN.exec(String(value ?? "").trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 2000 || year > 2100) return null;
  return isoFromDbDate(date);
}

export function isoFromParts(year: number, month: number, day: number): IsoDate {
  return isoFromDbDate(new Date(Date.UTC(year, month - 1, day)));
}

export function isoFromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10);
}

export function isoToDbDate(iso: IsoDate) {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function isoParts(iso: IsoDate) {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) };
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = isoToDbDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return isoFromDbDate(date);
}

/** 1 = Thứ 2 … 7 = Chủ nhật. */
export function isoWeekdayOf(iso: IsoDate) {
  const day = isoToDbDate(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

export function startOfWeek(iso: IsoDate): IsoDate {
  return addDays(iso, 1 - isoWeekdayOf(iso));
}

export function monthRange(month: number, year: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: isoFromParts(year, month, 1), to: isoFromParts(year, month, lastDay) };
}

export function previousMonth(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

const vietnamDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function todayInVietnam(now = new Date()): IsoDate {
  return vietnamDate.format(now);
}

/** "2026-10-15" → "15/10". */
export function formatIsoDayMonth(iso: IsoDate) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

export function eachDay(from: IsoDate, to: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

export function slotActiveOn(slot: Pick<ScheduleSlot, "weekday" | "effectiveFrom" | "effectiveTo">, iso: IsoDate) {
  return (
    slot.weekday === isoWeekdayOf(iso) &&
    (!slot.effectiveFrom || slot.effectiveFrom <= iso) &&
    (!slot.effectiveTo || iso <= slot.effectiveTo)
  );
}

/** Hai khoảng hiệu lực (null = mở) có giao nhau không. */
export function effectiveRangesOverlap(
  left: { effectiveFrom: IsoDate | null; effectiveTo: IsoDate | null },
  right: { effectiveFrom: IsoDate | null; effectiveTo: IsoDate | null }
) {
  const leftStartsBeforeRightEnds = !left.effectiveFrom || !right.effectiveTo || left.effectiveFrom <= right.effectiveTo;
  const rightStartsBeforeLeftEnds = !right.effectiveFrom || !left.effectiveTo || right.effectiveFrom <= left.effectiveTo;
  return leftStartsBeforeRightEnds && rightStartsBeforeLeftEnds;
}

function sessionKey(classId: string, date: IsoDate, startTime: string) {
  return `${classId}|${date}|${startTime}`;
}

/**
 * Các buổi học trong khoảng ngày: buổi suy từ lịch cố định, ghép với điểm danh đã ghi; điểm danh
 * không khớp lịch nào (học bù, hoặc lịch đã đổi giờ) vẫn hiện như một buổi riêng.
 */
export function buildCalendar(input: {
  slots: ScheduleSlot[];
  records: SessionRecord[];
  from: IsoDate;
  to: IsoDate;
  today: IsoDate;
}): CalendarSession[] {
  const recordByKey = new Map(input.records.map((record) => [sessionKey(record.classId, record.date, record.startTime), record]));
  const used = new Set<string>();
  const sessions: CalendarSession[] = [];

  for (const date of eachDay(input.from, input.to)) {
    for (const slot of input.slots) {
      if (!slotActiveOn(slot, date)) continue;
      const key = sessionKey(slot.classId, date, slot.startTime);
      if (used.has(key)) continue;
      used.add(key);
      const record = recordByKey.get(key);
      sessions.push({
        key,
        classId: slot.classId,
        date,
        startTime: slot.startTime,
        endTime: record?.endTime ?? slot.endTime,
        room: record?.room || slot.room,
        scheduled: true,
        recordId: record?.id ?? null,
        status: record?.status ?? (date < input.today ? "pending" : "upcoming"),
        reason: record?.reason ?? null
      });
    }
  }

  for (const record of input.records) {
    const key = sessionKey(record.classId, record.date, record.startTime);
    if (used.has(key) || record.date < input.from || record.date > input.to) continue;
    used.add(key);
    sessions.push({
      key,
      classId: record.classId,
      date: record.date,
      startTime: record.startTime,
      endTime: record.endTime,
      room: record.room,
      scheduled: false,
      recordId: record.id,
      status: record.status,
      reason: record.reason
    });
  }

  return sessions.sort(
    (left, right) =>
      left.date.localeCompare(right.date) ||
      left.startTime.localeCompare(right.startTime) ||
      left.classId.localeCompare(right.classId)
  );
}

/** Số buổi theo lịch cố định trong khoảng ngày (không tính điểm danh). */
export function countScheduledInRange(slots: ScheduleSlot[], from: IsoDate, to: IsoDate) {
  let count = 0;
  for (const date of eachDay(from, to)) {
    const startTimes = new Set<string>();
    for (const slot of slots) {
      if (slotActiveOn(slot, date)) startTimes.add(`${slot.classId}|${slot.startTime}`);
    }
    count += startTimes.size;
  }
  return count;
}

export function summarizeSessions(sessions: CalendarSession[]) {
  const summary = { total: 0, held: 0, cancelled: 0, makeup: 0, pending: 0, upcoming: 0 };
  for (const session of sessions) {
    summary.total += 1;
    summary[session.status] += 1;
  }
  return summary;
}

// ---------------------------------------------------------------------------
// Gợi ý số buổi thu tiền.
//
// Thu trước theo tháng: tháng M thu theo lịch của tháng M, trừ đi số buổi lớp nghỉ chưa bù của
// tháng M-1 (buổi nghỉ - buổi học bù trong tháng M-1). Buổi nghỉ của tháng M luôn để sang M+1
// trừ, nên mỗi buổi nghỉ chỉ bị trừ đúng một lần dù hóa đơn tạo lúc nào.
// ---------------------------------------------------------------------------

export type SessionAdjustment = {
  month: number;
  year: number;
  /** Số buổi theo lịch cố định của tháng M; null = lớp chưa xếp lịch cho tháng này. */
  scheduled: number | null;
  previous: {
    month: number;
    year: number;
    cancelled: AdjustmentItem[];
    makeups: AdjustmentItem[];
  };
};

/** Một buổi nghỉ / học bù; makeupFor = buổi gốc mà buổi bù này dời từ đó (chỉ buổi bù). */
export type AdjustmentItem = { date: IsoDate; reason: string | null; makeupFor?: IsoDate | null };

export type SessionSuggestion = {
  sessions: number;
  /** Diễn giải ngắn cho admin, vd "8 theo lịch − 1 nghỉ T10". */
  hint: string;
  /** Lý do trừ/cộng gửi phụ huynh, rỗng nếu không điều chỉnh. */
  note: string;
};

function describeDates(items: AdjustmentItem[]) {
  return items
    .map((item) => (item.reason ? `${formatIsoDayMonth(item.date)} (${item.reason})` : formatIsoDayMonth(item.date)))
    .join(", ");
}

/**
 * Lý do điều chỉnh buổi gửi phụ huynh. Buổi dời (nghỉ + bù trong cùng tháng) tự triệt tiêu nên
 * không kể ra; chỉ kể buổi nghỉ chưa bù, hoặc buổi học bù dư.
 */
export function describeAdjustment(input: {
  previousMonth: number;
  cancelled: AdjustmentItem[];
  makeups: AdjustmentItem[];
}) {
  const cancelledDates = new Set(input.cancelled.map((item) => item.date));
  const pairedDates = new Set(
    input.makeups.flatMap((item) => (item.makeupFor && cancelledDates.has(item.makeupFor) ? [item.makeupFor] : []))
  );
  const openCancelled = input.cancelled.filter((item) => !pairedDates.has(item.date));
  const openMakeups = input.makeups.filter((item) => !(item.makeupFor && pairedDates.has(item.makeupFor)));
  const net = openCancelled.length - openMakeups.length;
  if (net > 0) {
    // Còn buổi bù chung (không gắn buổi cụ thể): kể hết buổi nghỉ kèm số buổi đã bù để tự đối chiếu.
    const madeUp = openMakeups.length > 0 ? `, đã bù ${openMakeups.length}` : "";
    return `đã trừ ${net} buổi lớp nghỉ T${input.previousMonth}: ${describeDates(openCancelled)}${madeUp}`;
  }
  if (net < 0) {
    return `cộng ${-net} buổi học bù T${input.previousMonth}: ${describeDates(openMakeups)}`;
  }
  return "";
}

/**
 * Số buổi gợi ý của một học sinh cho tháng M.
 *
 * - Số buổi gốc: buổi riêng của học sinh, không có thì theo lịch tháng M, lớp chưa xếp lịch thì
 *   theo mặc định của lớp.
 * - Chỉ trừ/cộng khi tháng trước học sinh có hóa đơn thu tiền (đang học), và chỉ các buổi từ
 *   ngày học sinh bắt đầu học.
 */
export function suggestSessions(input: {
  adjustment: SessionAdjustment;
  classDefault: number;
  sessionsOverride: number | null;
  startDate: IsoDate;
  billedPreviousMonth: boolean;
}): SessionSuggestion {
  const { adjustment } = input;
  const baseSource =
    input.sessionsOverride !== null ? "riêng" : adjustment.scheduled !== null ? "theo lịch" : "mặc định";
  const base = input.sessionsOverride ?? adjustment.scheduled ?? input.classDefault;

  const counts = (item: { date: IsoDate }) => item.date >= input.startDate;
  const cancelled = input.billedPreviousMonth ? adjustment.previous.cancelled.filter(counts) : [];
  const makeups = input.billedPreviousMonth ? adjustment.previous.makeups.filter(counts) : [];
  const net = cancelled.length - makeups.length;
  const sessions = Math.max(0, Math.min(60, base - net));

  const previousLabel = `T${adjustment.previous.month}`;
  const hint =
    net > 0
      ? `${base} ${baseSource} − ${net} nghỉ ${previousLabel}`
      : net < 0
        ? `${base} ${baseSource} + ${-net} bù ${previousLabel}`
        : `${base} ${baseSource}`;

  return {
    sessions,
    hint,
    note: describeAdjustment({ previousMonth: adjustment.previous.month, cancelled, makeups })
  };
}
