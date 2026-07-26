import { CalendarDays, Clock, MapPin, Trash2 } from "lucide-react";
import { deleteScheduleAction } from "@/lib/actions";
import { AddScheduleForm } from "@/components/AddScheduleForm";
import { Badge, Button, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { WEEKDAYS, countScheduledSessions, sortSchedules, weekdayLabel } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const classes = await prisma.classRoom.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      shortCode: true,
      teacherName: true,
      teacherSharePercent: true,
      sessionsPerMonthDefault: true,
      schedules: {
        select: {
          id: true,
          weekday: true,
          startTime: true,
          endTime: true,
          room: true,
          note: true
        }
      }
    }
  });

  const slots = classes.flatMap((classRoom) =>
    classRoom.schedules.map((slot) => ({ ...slot, classRoom }))
  );
  const byWeekday = new Map<number, typeof slots>();
  for (const slot of slots) {
    byWeekday.set(slot.weekday, [...(byWeekday.get(slot.weekday) ?? []), slot]);
  }

  const scheduledClasses = classes.filter((classRoom) => classRoom.schedules.length > 0);
  const totalSessionsThisMonth = classes.reduce(
    (sum, classRoom) => sum + (countScheduledSessions(classRoom.schedules, month, year) ?? 0),
    0
  );
  const classesWithoutShare = classes.filter((classRoom) => classRoom.teacherSharePercent <= 0).length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Thời khóa biểu"
        description="Lịch học cố định lặp theo tuần. Số buổi mỗi tháng được suy ra từ đây để tính lương giáo viên."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Buổi học mỗi tuần"
          tone="primary"
          value={slots.length}
          hint={`${scheduledClasses.length}/${classes.length} lớp đã xếp lịch`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <StatCard
          label={`Tổng buổi dạy ${formatMonth(month, year)}`}
          tone="neutral"
          value={totalSessionsThisMonth}
          hint="Cộng dồn theo lịch của mọi lớp"
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Lớp chưa khai % lương GV"
          tone={classesWithoutShare > 0 ? "warning" : "success"}
          value={classesWithoutShare}
          hint="Lương tính theo % học phí đã thu, khai ở Lớp học → Sửa lớp"
          icon={<MapPin className="h-5 w-5" />}
        />
      </div>

      <Panel>
        <h2 className="font-bold">Xếp buổi học mới</h2>
        <p className="mb-4 mt-1 text-sm text-stone-600">
          Mỗi lớp có thể có nhiều buổi trong tuần. Trùng thứ và giờ bắt đầu trong cùng một lớp sẽ bị chặn.
        </p>
        <AddScheduleForm
          classes={classes.map((classRoom) => ({
            id: classRoom.id,
            name: classRoom.name,
            shortCode: classRoom.shortCode
          }))}
        />
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch tuần</h2>
        </div>
        {slots.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa xếp lịch buổi nào">
              Thêm buổi học ở trên để lịch tuần hiện tại đây.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto p-5">
            <div className="grid min-w-[900px] grid-cols-7 gap-3">
              {WEEKDAYS.map((day) => {
                const daySlots = sortSchedules(byWeekday.get(day.value) ?? []);
                return (
                  <div key={day.value} className="grid content-start gap-2">
                    <div className="flex items-center justify-between rounded-lg bg-stone-100 px-2.5 py-1.5">
                      <span className="text-xs font-bold uppercase tracking-wide text-stone-600">
                        {day.short}
                      </span>
                      <span className="text-xs font-semibold text-stone-500">{daySlots.length}</span>
                    </div>
                    {daySlots.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-stone-200 px-2 py-3 text-center text-xs text-stone-400">
                        Trống
                      </p>
                    ) : (
                      daySlots.map((slot) => (
                        <div
                          key={slot.id}
                          className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-2.5 transition-colors hover:bg-indigo-50"
                        >
                          <p className="text-xs font-bold text-primary">
                            {slot.startTime}–{slot.endTime}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold" title={slot.classRoom.name}>
                            {slot.classRoom.name}
                          </p>
                          <p className="truncate text-xs text-stone-500">
                            {slot.classRoom.teacherName || "Chưa gán GV"}
                            {slot.room ? ` · ${slot.room}` : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch theo lớp</h2>
        </div>
        <div className="divide-y divide-stone-100">
          {classes.map((classRoom) => {
            const sessions = countScheduledSessions(classRoom.schedules, month, year);
            return (
              <div key={classRoom.id} className="grid gap-3 p-5 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div>
                  <p className="font-semibold">{classRoom.name}</p>
                  <p className="text-xs text-stone-500">
                    {classRoom.shortCode}
                    {classRoom.teacherName ? ` · ${classRoom.teacherName}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={sessions === null ? "neutral" : "primary"}>
                      {sessions === null
                        ? `Mặc định ${classRoom.sessionsPerMonthDefault} buổi/tháng`
                        : `${sessions} buổi trong ${formatMonth(month, year)}`}
                    </Badge>
                    {classRoom.teacherSharePercent > 0 ? (
                      <Badge tone="success">GV hưởng {classRoom.teacherSharePercent}% đã thu</Badge>
                    ) : (
                      <Badge tone="warning">Chưa khai % lương GV</Badge>
                    )}
                  </div>
                </div>

                {classRoom.schedules.length === 0 ? (
                  <p className="self-center text-sm text-stone-500">
                    Chưa xếp lịch. Số buổi sẽ dùng mặc định của lớp khi tính lương.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {sortSchedules(classRoom.schedules).map((slot) => (
                      <div
                        key={slot.id}
                        className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-sm"
                      >
                        <div className="text-sm">
                          <p className="font-semibold">
                            {weekdayLabel(slot.weekday)} · {slot.startTime}–{slot.endTime}
                          </p>
                          {slot.room || slot.note ? (
                            <p className="text-xs text-stone-500">
                              {[slot.room, slot.note].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        <form action={deleteScheduleAction}>
                          <input type="hidden" name="id" value={slot.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            className="h-8 w-8 px-0 text-stone-400 hover:bg-rose-50 hover:text-warning"
                            title="Xóa buổi học"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
