"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertTriangle, CalendarPlus } from "lucide-react";
import { createScheduleAction } from "@/lib/actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { WEEKDAYS } from "@/lib/schedule";

export function AddScheduleForm({
  classes
}: {
  classes: Array<{ id: string; name: string; shortCode: string }>;
}) {
  const [state, action, pending] = useActionState(createScheduleAction, { error: "", ok: false });
  const formRef = useRef<HTMLFormElement>(null);
  const wasOk = useRef(false);

  // Thêm xong thì chỉ reset giờ/phòng, giữ lại lớp đang chọn để xếp tiếp buổi khác.
  useEffect(() => {
    if (state.ok && !wasOk.current) {
      wasOk.current = true;
      const form = formRef.current;
      if (form) {
        (form.elements.namedItem("room") as HTMLInputElement | null)?.setAttribute("value", "");
        (form.elements.namedItem("note") as HTMLInputElement | null)?.setAttribute("value", "");
      }
    }
    if (!state.ok) wasOk.current = false;
  }, [state.ok]);

  if (classes.length === 0) {
    return (
      <p className="text-sm text-stone-600">
        Chưa có lớp đang hoạt động. Tạo lớp trước rồi quay lại xếp lịch.
      </p>
    );
  }

  return (
    <form ref={formRef} action={action} className="grid gap-3 lg:grid-cols-6">
      <div className="lg:col-span-2">
        <Field label="Lớp">
          <Select name="classId" required defaultValue={classes[0]?.id}>
            {classes.map((classRoom) => (
              <option key={classRoom.id} value={classRoom.id}>
                {classRoom.name} ({classRoom.shortCode})
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Thứ">
        <Select name="weekday" required defaultValue="1">
          {WEEKDAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Bắt đầu">
        <Input name="startTime" type="time" required defaultValue="18:00" />
      </Field>
      <Field label="Kết thúc">
        <Input name="endTime" type="time" required defaultValue="19:30" />
      </Field>
      <Field label="Phòng">
        <Input name="room" placeholder="P.1" />
      </Field>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 lg:col-span-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="lg:col-span-6">
        <Button type="submit" disabled={pending}>
          <CalendarPlus className="h-4 w-4" />
          {pending ? "Đang thêm..." : "Thêm buổi học"}
        </Button>
      </div>
    </form>
  );
}
