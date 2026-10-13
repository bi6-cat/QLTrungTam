"use client";

import { useState, useTransition } from "react";
import { CalendarX2, Check, Repeat2, RotateCcw, Trash2, X } from "lucide-react";
import { clsx } from "clsx";
import type { ResultState } from "@/lib/action-states";
import {
  addMakeupSessionAction,
  cancelDayAction,
  clearSessionAction,
  markSessionAction
} from "@/lib/actions/schedule";
import { formatIsoDayMonth, isoWeekdayOf, type CalendarSession, type IsoDate } from "@/lib/class-sessions";
import { weekdayLabel } from "@/lib/schedule";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button, Field, Input, Select } from "@/components/ui";
import { CANCEL_REASONS, STATUS_STYLE, classDot } from "@/components/schedule/styles";

/** Gọi action, báo toast; thành công thì nạp lại lịch rồi đóng hộp thoại. */
function useActionRunner(onDone: () => void) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const markStale = useRefreshWhenIdle(pending, onDone);
  function run(action: () => Promise<ResultState>) {
    setError("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success);
        markStale();
      } catch {
        setError("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }
  return { pending, error, run };
}

function dayLabel(date: IsoDate) {
  return `${weekdayLabel(isoWeekdayOf(date))} ${formatIsoDayMonth(date)}`;
}

function ReasonPicker({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {CANCEL_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            onClick={() => onChange(reason)}
            className={clsx(
              "focus-ring rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
              value === reason ? "border-rose-300 bg-rose-50 text-rose-700" : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            )}
          >
            {reason}
          </button>
        ))}
      </div>
      <Input value={value} onChange={(event) => onChange(event.target.value)} maxLength={120} placeholder={placeholder} />
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return message ? (
    <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{message}</p>
  ) : null;
}

export function SessionDialog({
  session,
  className,
  today,
  onClose
}: {
  session: CalendarSession & { colorIndex: number };
  className: string;
  today: IsoDate;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"menu" | "cancel" | "move">("menu");
  const [reason, setReason] = useState(session.status === "cancelled" ? session.reason ?? "" : "");
  const [moveDate, setMoveDate] = useState(session.date);
  const [moveStart, setMoveStart] = useState(session.startTime);
  const [moveEnd, setMoveEnd] = useState(session.endTime);
  const { pending, error, run } = useActionRunner(onClose);
  const style = STATUS_STYLE[session.status];
  const isMakeup = session.status === "makeup";
  const canMark = session.scheduled && !isMakeup;
  const isFuture = session.date > today;

  const mark = (status: "held" | "cancelled") =>
    run(() =>
      markSessionAction({ classId: session.classId, date: session.date, startTime: session.startTime, status, reason })
    );

  return (
    <Modal title={className || "Buổi học"} onClose={onClose} closeDisabled={pending}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={clsx("h-2.5 w-2.5 rounded-full", classDot(session.colorIndex))} />
          <span className="font-semibold">{dayLabel(session.date)}</span>
          <span className="text-stone-500">
            {session.startTime}–{session.endTime}
            {session.room ? ` · ${session.room}` : ""}
          </span>
          <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", style.chip)}>{style.label}</span>
        </div>
        {session.reason ? <p className="text-sm text-stone-600">Lý do: {session.reason}</p> : null}
        {!session.scheduled && !isMakeup ? (
          <p className="text-xs text-stone-500">Buổi này không còn trong lịch cố định (lịch đã đổi giờ hoặc ngừng); điểm danh cũ vẫn giữ.</p>
        ) : null}

        {mode === "menu" ? (
          <div className="grid gap-2">
            {canMark ? (
              <>
                <Button type="button" disabled={pending || isFuture || session.status === "held"} onClick={() => mark("held")}>
                  <Check className="h-4 w-4" />
                  {isFuture ? "Chưa tới ngày học" : "Đã học"}
                </Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={() => setMode("cancel")}>
                  <CalendarX2 className="h-4 w-4 text-rose-600" />
                  {session.status === "cancelled" ? "Sửa lý do nghỉ" : "Lớp nghỉ buổi này"}
                </Button>
                {session.status !== "cancelled" ? (
                  <Button type="button" variant="secondary" disabled={pending} onClick={() => setMode("move")}>
                    <Repeat2 className="h-4 w-4 text-violet-600" />
                    Dời sang ngày khác (học bù)
                  </Button>
                ) : null}
              </>
            ) : null}
            {session.recordId ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => clearSessionAction(session.recordId!))}
                className={isMakeup ? "text-rose-700 hover:bg-rose-50" : undefined}
              >
                {isMakeup ? <Trash2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                {isMakeup ? "Xóa buổi bù" : "Bỏ điểm danh"}
              </Button>
            ) : null}
          </div>
        ) : null}

        {mode === "cancel" ? (
          <div className="grid gap-3">
            <Field label="Lý do lớp nghỉ" hint="Hiện trong tin nhắn học phí tháng sau">
              <ReasonPicker value={reason} onChange={setReason} placeholder="VD: GV ốm" />
            </Field>
            <p className="text-xs text-stone-500">
              Buổi nghỉ chưa bù sẽ được trừ vào số buổi thu tháng sau. Nếu có học bù, dùng “Dời sang ngày khác” thay vì ghi nghỉ.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setMode("menu")}>
                <X className="h-4 w-4" />
                Quay lại
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={() => mark("cancelled")}>
                {pending ? "Đang lưu..." : "Ghi lớp nghỉ"}
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "move" ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Ngày học bù">
                <Input type="date" value={moveDate} onChange={(event) => setMoveDate(event.target.value)} />
              </Field>
              <Field label="Bắt đầu">
                <Input type="time" value={moveStart} onChange={(event) => setMoveStart(event.target.value)} />
              </Field>
              <Field label="Kết thúc">
                <Input type="time" value={moveEnd} onChange={(event) => setMoveEnd(event.target.value)} />
              </Field>
            </div>
            <Field label="Lý do dời (không bắt buộc)">
              <ReasonPicker value={reason} onChange={setReason} placeholder="VD: GV bận" />
            </Field>
            <p className="text-xs text-stone-500">
              Buổi {formatIsoDayMonth(session.date)} ghi là lớp nghỉ và thêm buổi học bù; hai buổi bù trừ nhau nên số buổi thu không đổi.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setMode("menu")}>
                <X className="h-4 w-4" />
                Quay lại
              </Button>
              <Button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    addMakeupSessionAction({
                      classId: session.classId,
                      date: moveDate,
                      startTime: moveStart,
                      endTime: moveEnd,
                      room: session.room,
                      reason,
                      fromDate: session.date,
                      fromStartTime: session.startTime
                    })
                  )
                }
              >
                {pending ? "Đang lưu..." : "Dời buổi"}
              </Button>
            </div>
          </div>
        ) : null}

        <ErrorBox message={error} />
      </div>
    </Modal>
  );
}

export function CancelDayDialog({
  date,
  sessionCount,
  filtered,
  onClose
}: {
  date: IsoDate;
  sessionCount: number;
  filtered: boolean;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("Nghỉ lễ");
  const { pending, error, run } = useActionRunner(onClose);
  return (
    <Modal title={`Nghỉ cả ngày · ${dayLabel(date)}`} onClose={onClose} closeDisabled={pending}>
      <div className="grid gap-4">
        <p className="text-sm text-stone-600">
          Mọi buổi theo lịch của <strong>tất cả các lớp</strong> trong ngày này sẽ ghi là lớp nghỉ
          {filtered ? "" : ` (${sessionCount} buổi)`}. Buổi học bù trong ngày giữ nguyên.
        </p>
        {filtered ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">
            Đang lọc một lớp, nhưng thao tác này áp dụng cho cả trung tâm. Muốn nghỉ riêng một lớp thì bấm vào buổi đó.
          </p>
        ) : null}
        <Field label="Lý do">
          <ReasonPicker value={reason} onChange={setReason} placeholder="VD: Nghỉ Quốc khánh" />
        </Field>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={pending || !reason.trim()} onClick={() => run(() => cancelDayAction({ date, reason }))}>
            {pending ? "Đang lưu..." : "Ghi nghỉ cả ngày"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function MakeupDialog({
  date,
  classes,
  defaultClassId,
  onClose
}: {
  date: IsoDate;
  classes: Array<{ id: string; name: string }>;
  defaultClassId: string;
  onClose: () => void;
}) {
  const [classId, setClassId] = useState(defaultClassId);
  const [day, setDay] = useState(date);
  const [startTime, setStartTime] = useState("18:00");
  const [endTime, setEndTime] = useState("19:30");
  const [room, setRoom] = useState("");
  const [reason, setReason] = useState("");
  const { pending, error, run } = useActionRunner(onClose);
  return (
    <Modal title="Thêm buổi học bù" onClose={onClose} closeDisabled={pending}>
      <div className="grid gap-3">
        <Field label="Lớp">
          <Select value={classId} onChange={(event) => setClassId(event.target.value)}>
            {classes.map((classRoom) => (
              <option key={classRoom.id} value={classRoom.id}>
                {classRoom.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ngày">
            <Input type="date" value={day} onChange={(event) => setDay(event.target.value)} />
          </Field>
          <Field label="Bắt đầu">
            <Input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          </Field>
          <Field label="Kết thúc">
            <Input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phòng">
            <Input value={room} onChange={(event) => setRoom(event.target.value)} maxLength={60} placeholder="P.1" />
          </Field>
          <Field label="Ghi chú">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="VD: Bù buổi 15/10" />
          </Field>
        </div>
        <p className="text-xs text-stone-500">
          Mỗi buổi học bù bù lại một buổi lớp nghỉ cùng tháng. Muốn dời một buổi cụ thể thì bấm vào buổi đó → “Dời sang ngày khác”.
        </p>
        <ErrorBox message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={pending || !classId}
            onClick={() => run(() => addMakeupSessionAction({ classId, date: day, startTime, endTime, room, reason }))}
          >
            {pending ? "Đang lưu..." : "Thêm buổi bù"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
