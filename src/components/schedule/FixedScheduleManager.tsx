"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { CalendarOff, ChevronDown, Pencil, Settings2 } from "lucide-react";
import { clsx } from "clsx";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { stopScheduleAction, updateScheduleAction } from "@/lib/actions/schedule";
import { formatIsoDayMonth, type IsoDate, type ScheduleSlot } from "@/lib/class-sessions";
import { WEEKDAYS, weekdayLabel } from "@/lib/schedule";
import { AddScheduleForm } from "@/components/AddScheduleForm";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button, Field, Input, Panel, Select } from "@/components/ui";
import { classDot } from "@/components/schedule/styles";

type ManagedSlot = ScheduleSlot & { note: string | null };

export function FixedScheduleManager({
  today,
  defaultEffectiveFrom,
  classes
}: {
  today: IsoDate;
  defaultEffectiveFrom: IsoDate;
  classes: Array<{ id: string; name: string; shortCode: string; colorIndex: number; slots: ManagedSlot[] }>;
}) {
  const unscheduled = classes.filter((classRoom) => classRoom.slots.length === 0).length;
  const [open, setOpen] = useState(unscheduled === classes.length);
  const [editing, setEditing] = useState<ManagedSlot | null>(null);
  const [stopping, setStopping] = useState<(ManagedSlot & { className: string }) | null>(null);

  return (
    <Panel className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="focus-ring flex w-full items-center justify-between gap-3 p-5 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <span>
            <span className="block font-bold">Lịch cố định</span>
            <span className="block text-sm text-stone-500">
              Lịch lặp theo tuần của từng lớp{unscheduled > 0 ? ` · ${unscheduled} lớp chưa xếp lịch` : ""}
            </span>
          </span>
        </span>
        <ChevronDown className={clsx("h-5 w-5 text-stone-400 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="grid gap-5 border-t border-stone-200 p-5">
          <div>
            <h3 className="text-sm font-bold">Thêm buổi vào lịch</h3>
            <p className="mb-3 mt-1 text-xs text-stone-500">
              “Áp dụng từ” là ngày đầu tiên buổi này có trên thời khóa biểu (mặc định đầu tháng này).
            </p>
            <AddScheduleForm
              classes={classes.map((classRoom) => ({ id: classRoom.id, name: classRoom.name, shortCode: classRoom.shortCode }))}
              defaultEffectiveFrom={defaultEffectiveFrom}
            />
          </div>

          <div className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {classes.map((classRoom) => (
              <div key={classRoom.id} className="grid gap-2 p-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-center">
                <p className="flex items-center gap-2 font-semibold">
                  <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", classDot(classRoom.colorIndex))} />
                  <span className="truncate">{classRoom.name}</span>
                </p>
                {classRoom.slots.length === 0 ? (
                  <p className="text-sm text-stone-500">Chưa xếp lịch, số buổi mỗi tháng dùng mặc định của lớp.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {classRoom.slots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-1 rounded-xl border border-stone-200 bg-white py-1 pl-3 pr-1 shadow-sm">
                        <div className="text-sm">
                          <p className="font-semibold">
                            {weekdayLabel(slot.weekday)} · {slot.startTime}–{slot.endTime}
                          </p>
                          <p className="text-xs text-stone-500">
                            {[
                              slot.room,
                              slot.effectiveFrom && slot.effectiveFrom > today ? `từ ${formatIsoDayMonth(slot.effectiveFrom)}` : "",
                              slot.effectiveTo ? `đến ${formatIsoDayMonth(slot.effectiveTo)}` : ""
                            ]
                              .filter(Boolean)
                              .join(" · ") || " "}
                          </p>
                        </div>
                        <Button type="button" variant="ghost" className="h-8 gap-1 rounded-lg px-2 text-xs text-stone-500 hover:text-primary" title="Sửa giờ" onClick={() => setEditing(slot)}>
                          <Pencil className="h-3.5 w-3.5" />
                          Sửa
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 gap-1 rounded-lg px-2 text-xs text-stone-500 hover:bg-rose-50 hover:text-warning"
                          title="Ngừng buổi này"
                          onClick={() => setStopping({ ...slot, className: classRoom.name })}
                        >
                          <CalendarOff className="h-3.5 w-3.5" />
                          Ngừng
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {editing ? <EditSlotDialog slot={editing} onClose={() => setEditing(null)} /> : null}
      {stopping ? <StopSlotDialog slot={stopping} today={today} onClose={() => setStopping(null)} /> : null}
    </Panel>
  );
}

function EditSlotDialog({ slot, onClose }: { slot: ManagedSlot; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateScheduleAction, EMPTY_RESULT_STATE);
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    onClose();
  }, [state, onClose]);

  return (
    <Modal title="Sửa lịch cố định" onClose={onClose} closeDisabled={pending}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={slot.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Thứ">
            <Select name="weekday" defaultValue={slot.weekday}>
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Phòng">
            <Input name="room" defaultValue={slot.room} maxLength={60} />
          </Field>
          <Field label="Bắt đầu">
            <Input name="startTime" type="time" defaultValue={slot.startTime} required />
          </Field>
          <Field label="Kết thúc">
            <Input name="endTime" type="time" defaultValue={slot.endTime} required />
          </Field>
        </div>
        <p className="text-xs text-stone-500">
          Áp dụng cho mọi buổi chưa điểm danh; buổi đã điểm danh giữ giờ cũ. Lớp đổi lịch từ một ngày nhất định thì nên
          “Ngừng” buổi cũ rồi thêm buổi mới.
        </p>
        {state.error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{state.error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function StopSlotDialog({
  slot,
  today,
  onClose
}: {
  slot: ManagedSlot & { className: string };
  today: IsoDate;
  onClose: () => void;
}) {
  const [fromDate, setFromDate] = useState(today);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function confirm() {
    setError("");
    startTransition(async () => {
      try {
        const result = await stopScheduleAction(slot.id, fromDate);
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success);
        onClose();
      } catch {
        setError("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <Modal title="Ngừng buổi học" onClose={onClose} closeDisabled={pending}>
      <div className="grid gap-3">
        <p className="text-sm text-stone-600">
          Ngừng buổi <strong>{weekdayLabel(slot.weekday)} {slot.startTime}–{slot.endTime}</strong> của lớp {slot.className}.
          Các buổi trước ngày ngừng vẫn còn trên thời khóa biểu.
        </p>
        <Field label="Ngừng từ ngày">
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
        </Field>
        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={pending || !fromDate} onClick={confirm}>
            {pending ? "Đang lưu..." : "Ngừng buổi học"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
