import { AlertTriangle, CalendarCheck2, CalendarDays, CalendarX2 } from "lucide-react";
import { ScheduleBoard, type BoardClass, type BoardSession } from "@/components/schedule/ScheduleBoard";
import { FixedScheduleManager } from "@/components/schedule/FixedScheduleManager";
import { PageHeader, StatCard } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import {
  addDays,
  buildCalendar,
  countScheduledInRange,
  eachDay,
  isoParts,
  isoToDbDate,
  monthRange,
  parseIsoDate,
  previousMonth,
  startOfWeek,
  summarizeSessions,
  todayInVietnam
} from "@/lib/class-sessions";
import { scheduleSlotSelect, sessionRecordSelect, toScheduleSlot, toSessionRecord } from "@/lib/class-sessions-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; date?: string; month?: string; year?: string; classId?: string }>;
}) {
  // Chủ và quản lý phụ có toàn quyền trên thời khóa biểu (lịch cố định + điểm danh).
  await requireStaff();
  const params = await searchParams;
  const today = todayInVietnam();
  const view = params.view === "month" ? "month" : "week";

  const anchor = parseIsoDate(params.date) ?? today;
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month = Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : isoParts(anchor).month;
  const year = Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : isoParts(anchor).year;
  const range =
    view === "week" ? { from: startOfWeek(anchor), to: addDays(startOfWeek(anchor), 6) } : monthRange(month, year);

  // Buổi chưa điểm danh tính từ đầu tháng trước tới hôm qua: đủ để chốt số buổi thu tháng sau.
  const todayParts = isoParts(today);
  const previous = previousMonth(todayParts.month, todayParts.year);
  const pendingFrom = monthRange(previous.month, previous.year).from;
  const pendingTo = addDays(today, -1);
  const loadFrom = range.from < pendingFrom ? range.from : pendingFrom;
  const loadTo = range.to > today ? range.to : today;

  const classes = await prisma.classRoom.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      shortCode: true,
      teacherName: true,
      schedules: { select: { ...scheduleSlotSelect, note: true }, orderBy: [{ weekday: "asc" }, { startTime: "asc" }] },
      sessions: {
        where: { date: { gte: isoToDbDate(loadFrom), lte: isoToDbDate(loadTo) } },
        select: sessionRecordSelect
      }
    }
  });

  const classFilter = classes.some((classRoom) => classRoom.id === params.classId) ? params.classId : undefined;
  const visibleClasses = classFilter ? classes.filter((classRoom) => classRoom.id === classFilter) : classes;
  const slots = visibleClasses.flatMap((classRoom) => classRoom.schedules.map(toScheduleSlot));
  const records = visibleClasses.flatMap((classRoom) => classRoom.sessions.map(toSessionRecord));

  const calendar = buildCalendar({ slots, records, from: range.from, to: range.to, today });
  const pendingSessions = buildCalendar({ slots, records, from: pendingFrom, to: pendingTo, today }).filter(
    (session) => session.status === "pending"
  );
  const rangeSummary = summarizeSessions(calendar);

  const classIndex = new Map(classes.map((classRoom, index) => [classRoom.id, index]));
  const sessions: BoardSession[] = calendar.map((session) => ({ ...session, colorIndex: classIndex.get(session.classId) ?? 0 }));

  // Bảng tháng: thống kê theo lớp + số buổi gợi ý thu tháng sau (lịch tháng sau − nghỉ chưa bù tháng này).
  const nextMonth = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  const nextRange = monthRange(nextMonth.month, nextMonth.year);
  const boardClasses: BoardClass[] = visibleClasses.map((classRoom) => {
    const classSessions = calendar.filter((session) => session.classId === classRoom.id);
    const summary = summarizeSessions(classSessions);
    const nextScheduled = countScheduledInRange(classRoom.schedules.map(toScheduleSlot), nextRange.from, nextRange.to);
    const net = summary.cancelled - summary.makeup;
    return {
      id: classRoom.id,
      name: classRoom.name,
      shortCode: classRoom.shortCode,
      teacherName: classRoom.teacherName,
      colorIndex: classIndex.get(classRoom.id) ?? 0,
      summary,
      nextMonthSessions: nextScheduled > 0 ? Math.max(0, nextScheduled - net) : null,
      nextMonthHint:
        nextScheduled > 0
          ? `${nextScheduled} theo lịch T${nextMonth.month}${net > 0 ? ` − ${net} nghỉ` : net < 0 ? ` + ${-net} bù` : ""}`
          : "Chưa xếp lịch"
    };
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Thời khóa biểu"
        description="Bấm vào buổi học để điểm danh, ghi lớp nghỉ hoặc dời buổi. Buổi lớp nghỉ chưa bù được trừ vào số buổi thu tháng sau."
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={view === "week" ? "Buổi trong tuần" : `Buổi trong tháng ${month}`}
          tone="primary"
          value={rangeSummary.total}
          hint={`${rangeSummary.held} đã học · ${rangeSummary.upcoming} sắp tới`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <StatCard
          label="Chưa điểm danh"
          tone={pendingSessions.length > 0 ? "warning" : "success"}
          value={pendingSessions.length}
          hint={`Buổi đã qua từ ${pendingFrom.slice(8, 10)}/${pendingFrom.slice(5, 7)} tới hôm qua`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
        <StatCard
          label="Lớp nghỉ"
          tone="warning"
          value={rangeSummary.cancelled}
          hint={view === "week" ? "Trong tuần đang xem" : "Trong tháng đang xem"}
          icon={<CalendarX2 className="h-5 w-5" />}
        />
        <StatCard
          label="Học bù"
          tone="violet"
          value={rangeSummary.makeup}
          hint={view === "week" ? "Trong tuần đang xem" : "Trong tháng đang xem"}
          icon={<CalendarCheck2 className="h-5 w-5" />}
        />
      </div>

      <ScheduleBoard
        view={view}
        anchor={anchor}
        month={month}
        year={year}
        today={today}
        from={range.from}
        to={range.to}
        days={eachDay(range.from, range.to)}
        classFilter={classFilter ?? ""}
        classes={boardClasses}
        allClasses={classes.map((classRoom) => ({
          id: classRoom.id,
          name: classRoom.name,
          teacherName: classRoom.teacherName,
          colorIndex: classIndex.get(classRoom.id) ?? 0
        }))}
        sessions={sessions}
        hasSchedules={classes.some((classRoom) => classRoom.schedules.length > 0)}
        pendingInRange={calendar.filter((session) => session.scheduled && !session.recordId && session.date <= today).length}
        nextMonth={nextMonth.month}
      />

      <FixedScheduleManager
        today={today}
        defaultEffectiveFrom={monthRange(todayParts.month, todayParts.year).from}
        classes={classes.map((classRoom) => ({
          id: classRoom.id,
          name: classRoom.name,
          shortCode: classRoom.shortCode,
          colorIndex: classIndex.get(classRoom.id) ?? 0,
          slots: classRoom.schedules
            .map((slot) => ({ ...toScheduleSlot(slot), note: slot.note }))
            .filter((slot) => !slot.effectiveTo || slot.effectiveTo >= today)
        }))}
      />
    </div>
  );
}
