"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CalendarPlus, CalendarX2, CheckCheck, ChevronLeft, ChevronRight, Repeat2 } from "lucide-react";
import { clsx } from "clsx";
import { markPendingHeldAction } from "@/lib/actions/schedule";
import {
  addDays,
  formatIsoDayMonth,
  isoParts,
  isoWeekdayOf,
  type CalendarSession,
  type IsoDate
} from "@/lib/class-sessions";
import { weekdayShort } from "@/lib/schedule";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button, EmptyState, Panel, Select } from "@/components/ui";
import { CancelDayDialog, MakeupDialog, SessionDialog } from "@/components/schedule/SessionDialogs";
import { STATUS_STYLE, classDot } from "@/components/schedule/styles";

export type BoardSession = CalendarSession & { colorIndex: number };

export type BoardClass = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  colorIndex: number;
  summary: { total: number; held: number; cancelled: number; makeup: number; pending: number; upcoming: number };
  nextMonthSessions: number | null;
  nextMonthHint: string;
};

export type BoardClassOption = { id: string; name: string; teacherName: string; colorIndex: number };

function scheduleHref(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `/admin/schedule?${text}` : "/admin/schedule";
}

export function ScheduleBoard(props: {
  view: "week" | "month";
  anchor: IsoDate;
  month: number;
  year: number;
  today: IsoDate;
  from: IsoDate;
  to: IsoDate;
  days: IsoDate[];
  classFilter: string;
  classes: BoardClass[];
  allClasses: BoardClassOption[];
  sessions: BoardSession[];
  hasSchedules: boolean;
  pendingInRange: number;
  nextMonth: number;
}) {
  const { view, today, classFilter } = props;
  const router = useRouter();
  const [selected, setSelected] = useState<BoardSession | null>(null);
  const [cancelDay, setCancelDay] = useState<IsoDate | null>(null);
  const [makeupDate, setMakeupDate] = useState<IsoDate | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const markStale = useRefreshWhenIdle(bulkPending);
  const classById = new Map(props.allClasses.map((classRoom) => [classRoom.id, classRoom]));
  const classId = classFilter || undefined;

  const prevHref =
    view === "week"
      ? scheduleHref({ date: addDays(props.from, -7), classId })
      : scheduleHref({ view, month: props.month === 1 ? 12 : props.month - 1, year: props.month === 1 ? props.year - 1 : props.year, classId });
  const nextHref =
    view === "week"
      ? scheduleHref({ date: addDays(props.from, 7), classId })
      : scheduleHref({ view, month: props.month === 12 ? 1 : props.month + 1, year: props.month === 12 ? props.year + 1 : props.year, classId });
  const todayHref = scheduleHref({ view: view === "month" ? "month" : undefined, classId });
  const anchorParts = isoParts(props.anchor);
  const rangeLabel =
    view === "week"
      ? `${formatIsoDayMonth(props.from)} – ${formatIsoDayMonth(props.to)}/${props.to.slice(0, 4)}`
      : `Tháng ${props.month}/${props.year}`;
  const includesToday = props.from <= today && today <= props.to;
  const navButton =
    "focus-ring grid h-9 w-9 place-items-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-neutralText";

  function markAllHeld() {
    startBulk(async () => {
      try {
        const result = await markPendingHeldAction({ from: props.from, to: props.to, classId });
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          markStale();
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <Panel className="overflow-hidden p-0">
      <div className="grid gap-3 border-b border-stone-200 p-4 lg:flex lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-stone-300 bg-stone-50 p-1 text-sm font-semibold shadow-sm">
            <Link
              href={scheduleHref({ date: view === "month" ? (includesToday ? today : props.from) : props.anchor, classId })}
              className={clsx("inline-flex h-9 items-center rounded-lg px-3", view === "week" ? "bg-white text-primary shadow-sm" : "text-stone-600 hover:text-neutralText")}
            >
              Tuần
            </Link>
            <Link
              href={scheduleHref({ view: "month", month: anchorParts.month, year: anchorParts.year, classId })}
              className={clsx("inline-flex h-9 items-center rounded-lg px-3", view === "month" ? "bg-white text-primary shadow-sm" : "text-stone-600 hover:text-neutralText")}
            >
              Tháng
            </Link>
          </div>
          <div className="flex items-center gap-0.5 rounded-xl border border-stone-300 bg-white p-1 shadow-sm">
            <Link href={prevHref} className={navButton} aria-label={view === "week" ? "Tuần trước" : "Tháng trước"}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="inline-flex h-9 min-w-[150px] items-center justify-center gap-2 px-3 text-sm font-bold text-neutralText">
              <CalendarDays className="h-4 w-4 text-primary" />
              {rangeLabel}
            </span>
            <Link href={nextHref} className={navButton} aria-label={view === "week" ? "Tuần sau" : "Tháng sau"}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {!includesToday ? (
            <Link href={todayHref} className="focus-ring inline-flex h-9 items-center rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-indigo-50">
              {view === "week" ? "Về tuần này" : "Về tháng này"}
            </Link>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Lọc theo lớp"
            className="h-9 w-auto min-w-40 py-0"
            value={classFilter}
            onChange={(event) =>
              router.push(
                view === "week"
                  ? scheduleHref({ date: props.anchor, classId: event.target.value })
                  : scheduleHref({ view, month: props.month, year: props.year, classId: event.target.value })
              )
            }
          >
            <option value="">Tất cả lớp</option>
            {props.allClasses.map((classRoom) => (
              <option key={classRoom.id} value={classRoom.id}>
                {classRoom.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3"
            onClick={() => setMakeupDate(includesToday ? today : props.from)}
            disabled={props.allClasses.length === 0}
          >
            <CalendarPlus className="h-4 w-4" />
            Buổi bù
          </Button>
          <Button type="button" className="h-9 px-3" onClick={markAllHeld} disabled={bulkPending || props.pendingInRange === 0}>
            <CheckCheck className="h-4 w-4" />
            {bulkPending ? "Đang lưu..." : `Điểm danh đã học (${props.pendingInRange})`}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-stone-100 px-4 py-2 text-xs text-stone-600">
        {(["upcoming", "pending", "held", "cancelled", "makeup"] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={clsx("h-2.5 w-2.5 rounded-sm", STATUS_STYLE[status].cell)} />
            {STATUS_STYLE[status].label}
          </span>
        ))}
      </div>

      {!props.hasSchedules ? (
        <div className="p-5">
          <EmptyState title="Chưa xếp lịch cố định">
            Thêm lịch cố định ở phần dưới; các buổi trong tuần sẽ tự hiện ở đây để điểm danh.
          </EmptyState>
        </div>
      ) : view === "week" ? (
        <WeekView
          days={props.days}
          today={today}
          sessions={props.sessions}
          classById={classById}
          onSelect={setSelected}
          onCancelDay={setCancelDay}
          onMakeup={setMakeupDate}
        />
      ) : (
        <MonthView
          days={props.days}
          today={today}
          classes={props.classes}
          sessions={props.sessions}
          nextMonth={props.nextMonth}
          onSelect={setSelected}
          onCancelDay={setCancelDay}
        />
      )}

      {selected ? (
        <SessionDialog
          session={selected}
          className={classById.get(selected.classId)?.name ?? ""}
          today={today}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {cancelDay ? (
        <CancelDayDialog
          date={cancelDay}
          sessionCount={props.sessions.filter((session) => session.date === cancelDay && session.scheduled).length}
          filtered={Boolean(classFilter)}
          onClose={() => setCancelDay(null)}
        />
      ) : null}
      {makeupDate ? (
        <MakeupDialog
          date={makeupDate}
          classes={props.allClasses}
          defaultClassId={classFilter || props.allClasses[0]?.id || ""}
          onClose={() => setMakeupDate(null)}
        />
      ) : null}
    </Panel>
  );
}

function SessionCard({
  session,
  classRoom,
  onSelect
}: {
  session: BoardSession;
  classRoom: BoardClassOption | undefined;
  onSelect: (session: BoardSession) => void;
}) {
  const style = STATUS_STYLE[session.status];
  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className={clsx("focus-ring w-full rounded-lg border p-2 text-left transition-colors", style.card)}
    >
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span className={clsx("whitespace-nowrap text-xs font-bold text-neutralText", session.status === "cancelled" && "line-through decoration-rose-400")}>
          {session.startTime}–{session.endTime}
        </span>
        <span className={clsx("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", style.chip)}>{style.label}</span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
        <span className={clsx("h-2 w-2 shrink-0 rounded-full", classDot(session.colorIndex))} />
        <span className="truncate">{classRoom?.name ?? "Lớp"}</span>
      </p>
      {classRoom?.teacherName || session.room ? (
        <p className="truncate text-xs text-stone-500">
          {[classRoom?.teacherName, session.room].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {session.reason ? <p className="mt-0.5 truncate text-[11px] font-medium text-stone-600">{session.reason}</p> : null}
    </button>
  );
}

function WeekView({
  days,
  today,
  sessions,
  classById,
  onSelect,
  onCancelDay,
  onMakeup
}: {
  days: IsoDate[];
  today: IsoDate;
  sessions: BoardSession[];
  classById: Map<string, BoardClassOption>;
  onSelect: (session: BoardSession) => void;
  onCancelDay: (date: IsoDate) => void;
  onMakeup: (date: IsoDate) => void;
}) {
  return (
    // 7 cột chỉ khi màn đủ rộng (mỗi cột ~160px); hẹp hơn thì xếp 4/2/1 cột để thẻ buổi học không tràn.
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {days.map((day) => {
        const daySessions = sessions.filter((session) => session.date === day);
        const isToday = day === today;
        return (
          <div
            key={day}
            className={clsx(
              "grid min-w-0 content-start gap-2 rounded-xl border p-2",
              isToday ? "border-indigo-300 bg-indigo-50/50" : "border-stone-200 bg-stone-50/60"
            )}
          >
            <div className="flex items-center justify-between gap-1 px-0.5">
              <p className="text-sm">
                <span className="font-bold uppercase text-stone-500">{weekdayShort(isoWeekdayOf(day))}</span>{" "}
                <span className={clsx("font-bold", isToday ? "text-primary" : "text-neutralText")}>{formatIsoDayMonth(day)}</span>
              </p>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={() => onMakeup(day)}
                  className="focus-ring grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-violet-600"
                  title="Thêm buổi học bù ngày này"
                  aria-label={`Thêm buổi học bù ngày ${formatIsoDayMonth(day)}`}
                >
                  <Repeat2 className="h-4 w-4" />
                </button>
                {daySessions.some((session) => session.scheduled) ? (
                  <button
                    type="button"
                    onClick={() => onCancelDay(day)}
                    className="focus-ring grid h-7 w-7 place-items-center rounded-md text-stone-400 hover:bg-white hover:text-rose-600"
                    title="Nghỉ cả ngày (lễ, sự cố…)"
                    aria-label={`Nghỉ cả ngày ${formatIsoDayMonth(day)}`}
                  >
                    <CalendarX2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>
            {daySessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-stone-200 px-2 py-3 text-center text-xs text-stone-400">Không có buổi</p>
            ) : (
              daySessions.map((session) => (
                <SessionCard key={session.key} session={session} classRoom={classById.get(session.classId)} onSelect={onSelect} />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({
  days,
  today,
  classes,
  sessions,
  nextMonth,
  onSelect,
  onCancelDay
}: {
  days: IsoDate[];
  today: IsoDate;
  classes: BoardClass[];
  sessions: BoardSession[];
  nextMonth: number;
  onSelect: (session: BoardSession) => void;
  onCancelDay: (date: IsoDate) => void;
}) {
  const byCell = new Map<string, BoardSession[]>();
  for (const session of sessions) {
    const key = `${session.classId}|${session.date}`;
    byCell.set(key, [...(byCell.get(key) ?? []), session]);
  }
  const scheduledDays = new Set(sessions.filter((session) => session.scheduled).map((session) => session.date));
  // Ngày đang rê chuột: tô mờ cả cột để gióng ô với tiêu đề ngày (dòng đã có hover riêng).
  const [hoverDay, setHoverDay] = useState<IsoDate | null>(null);
  const dayBg = (day: IsoDate, weekend: string, todayBg: string) =>
    day === hoverDay ? "bg-indigo-100/50" : day === today ? todayBg : isoWeekdayOf(day) >= 6 ? weekend : "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm" onMouseLeave={() => setHoverDay(null)}>
        <thead>
          <tr className="text-xs text-stone-500">
            <th className="sticky left-0 z-10 min-w-40 border-b border-stone-200 bg-white px-3 py-2 text-left font-semibold">Lớp</th>
            {days.map((day) => {
              const weekday = isoWeekdayOf(day);
              return (
                <th
                  key={day}
                  onMouseEnter={() => setHoverDay(day)}
                  className={clsx(
                    "border-b border-l border-stone-200 px-0.5 py-1 text-center font-semibold",
                    weekday === 1 ? "border-l-stone-300" : "border-l-stone-100",
                    dayBg(day, "bg-stone-50", "bg-indigo-50"),
                    (day === today || day === hoverDay) && "text-primary"
                  )}
                >
                  {scheduledDays.has(day) ? (
                    <button
                      type="button"
                      onClick={() => onCancelDay(day)}
                      className="focus-ring w-full rounded px-0.5 hover:bg-rose-50 hover:text-rose-700"
                      title={`Nghỉ cả ngày ${formatIsoDayMonth(day)}`}
                    >
                      <span className="block text-[10px] uppercase">{weekdayShort(weekday)}</span>
                      {Number(day.slice(8, 10))}
                    </button>
                  ) : (
                    <>
                      <span className="block text-[10px] uppercase">{weekdayShort(weekday)}</span>
                      {Number(day.slice(8, 10))}
                    </>
                  )}
                </th>
              );
            })}
            <th className="border-b border-l border-stone-200 px-2 py-2 text-right font-semibold" title="Buổi đã học / tổng buổi">Học</th>
            <th className="border-b border-stone-200 px-2 py-2 text-right font-semibold">Nghỉ</th>
            <th className="border-b border-stone-200 px-2 py-2 text-right font-semibold">Bù</th>
            <th className="border-b border-stone-200 px-2 py-2 text-right font-semibold" title="Đã qua mà chưa điểm danh">Chưa ĐD</th>
            <th className="border-b border-stone-200 px-3 py-2 text-right font-semibold" title="Số buổi gợi ý thu tháng sau">
              Thu T{nextMonth}
            </th>
          </tr>
        </thead>
        <tbody>
          {classes.map((classRoom) => (
            <tr key={classRoom.id} className="group hover:bg-indigo-50/40">
              <td className="sticky left-0 z-10 border-b border-stone-100 bg-white px-3 py-2 group-hover:bg-indigo-50" onMouseEnter={() => setHoverDay(null)}>
                <p className="flex items-center gap-1.5 font-semibold">
                  <span className={clsx("h-2 w-2 shrink-0 rounded-full", classDot(classRoom.colorIndex))} />
                  <span className="truncate">{classRoom.name}</span>
                </p>
                {classRoom.teacherName ? <p className="truncate text-xs text-stone-500">{classRoom.teacherName}</p> : null}
              </td>
              {days.map((day) => {
                const cellSessions = byCell.get(`${classRoom.id}|${day}`) ?? [];
                return (
                  <td
                    key={day}
                    onMouseEnter={() => setHoverDay(day)}
                    className={clsx(
                      "border-b border-l border-stone-100 px-0.5 py-1 text-center align-middle",
                      isoWeekdayOf(day) === 1 && "border-l-stone-300",
                      dayBg(day, "bg-stone-50/70 group-hover:bg-indigo-50/60", "bg-indigo-50/60 group-hover:bg-indigo-100/40")
                    )}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {cellSessions.map((session) => (
                        <button
                          key={session.key}
                          type="button"
                          onClick={() => onSelect(session)}
                          className={clsx("focus-ring h-4 w-4 rounded-sm transition-transform hover:scale-125", STATUS_STYLE[session.status].cell)}
                          title={`${formatIsoDayMonth(session.date)} ${session.startTime}–${session.endTime} · ${STATUS_STYLE[session.status].label}${session.reason ? ` · ${session.reason}` : ""}`}
                          aria-label={`${classRoom.name} ${formatIsoDayMonth(session.date)} ${session.startTime}: ${STATUS_STYLE[session.status].label}`}
                        />
                      ))}
                    </div>
                  </td>
                );
              })}
              <td className="border-b border-l border-stone-100 px-2 py-2 text-right tabular-nums" onMouseEnter={() => setHoverDay(null)}>
                {classRoom.summary.held}/{classRoom.summary.total}
              </td>
              <td className={clsx("border-b border-stone-100 px-2 py-2 text-right tabular-nums", classRoom.summary.cancelled > 0 && "font-semibold text-rose-700")}>
                {classRoom.summary.cancelled}
              </td>
              <td className={clsx("border-b border-stone-100 px-2 py-2 text-right tabular-nums", classRoom.summary.makeup > 0 && "font-semibold text-violet-700")}>
                {classRoom.summary.makeup}
              </td>
              <td className={clsx("border-b border-stone-100 px-2 py-2 text-right tabular-nums", classRoom.summary.pending > 0 && "font-semibold text-amber-700")}>
                {classRoom.summary.pending}
              </td>
              <td className="border-b border-stone-100 px-3 py-2 text-right" title={classRoom.nextMonthHint}>
                <span className="font-bold text-primary">{classRoom.nextMonthSessions ?? "—"}</span>
                <span className="block whitespace-nowrap text-[11px] text-stone-500">{classRoom.nextMonthHint}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
