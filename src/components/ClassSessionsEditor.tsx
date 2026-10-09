"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { updateClassDetailsAction } from "@/lib/actions/billing";
import { EMPTY_RESULT_STATE, type ResultState } from "@/lib/action-states";
import { toast } from "@/components/Toaster";
import { Badge, Button, Input } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { NOTE_MAX_LENGTH } from "@/lib/validation";

type SessionRow = {
  enrollmentId: string;
  studentName: string;
  phone: string;
  monthlyStatus: "active" | "on_leave";
  studentArchived: boolean;
  /** Sửa được số buổi: đang học, chưa có hóa đơn hoặc hóa đơn chưa đóng. */
  editable: boolean;
  sessions: number;
  note: string;
  enrolledClasses: Array<{ name: string; current: boolean }>;
  pricePerSession: number;
  joinHint: { joinedOn: string; sessions: number } | null;
  invoice: null | { status: "paid" | "unpaid" | "void" | "waived"; amount: number };
};

const MAX_SESSIONS = 60;
const INVOICE_STATUS = {
  unpaid: { label: "Chưa đóng", tone: "warning" },
  paid: { label: "Đã đóng", tone: "success" },
  void: { label: "Đã hủy", tone: "neutral" },
  waived: { label: "Đã miễn", tone: "primary" }
} as const;

function clamp(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_SESSIONS, Math.floor(value));
}

/**
 * Nhập số buổi và ghi chú theo tháng cho quản lý phụ; chỉ lưu kế hoạch, không tạo hóa đơn.
 * Server vẫn tự kiểm tra lại quyền và trạng thái của từng học sinh.
 */
export function ClassSessionsEditor({
  classId,
  month,
  year,
  rows
}: {
  classId: string;
  month: number;
  year: number;
  rows: SessionRow[];
}) {
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, number>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [state, action, saving] = useActionState(
    async (prevState: ResultState, formData: FormData) => {
      const result = await updateClassDetailsAction(prevState, formData);
      if (result.success) {
        setSessionDrafts({});
        setNoteDrafts({});
        toast.success(result.success);
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    },
    EMPTY_RESULT_STATE
  );

  const sessionsOf = (row: SessionRow) => sessionDrafts[row.enrollmentId] ?? row.sessions;
  const setSessions = (row: SessionRow, value: number) =>
    setSessionDrafts((current) => {
      const next = { ...current };
      const clamped = clamp(value);
      if (clamped === row.sessions) delete next[row.enrollmentId];
      else next[row.enrollmentId] = clamped;
      return next;
    });
  const setNote = (row: SessionRow, value: string) =>
    setNoteDrafts((current) => {
      const next = { ...current };
      if (value === row.note) delete next[row.enrollmentId];
      else next[row.enrollmentId] = value;
      return next;
    });

  const dirtyCount = new Set([...Object.keys(sessionDrafts), ...Object.keys(noteDrafts)]).size;
  const total = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (!row.editable) {
          const billed = row.invoice?.status === "paid" || row.invoice?.status === "unpaid";
          return billed ? sum + row.invoice!.amount : sum;
        }
        return sum + (sessionDrafts[row.enrollmentId] ?? row.sessions) * row.pricePerSession;
      }, 0),
    [sessionDrafts, rows]
  );

  return (
    <form action={action}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="intent" value="save" />

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3 text-sm text-stone-600 sm:px-6">
        <span>
          {formatMonth(month, year)} · {rows.length} học sinh
        </span>
        <span>
          Tổng dự kiến: <strong className="text-primary">{formatCurrency(total)}</strong>
        </span>
      </div>

      <ul className="divide-y divide-stone-100">
        {rows.map((row) => {
          const sessions = sessionsOf(row);
          const dirty = sessionDrafts[row.enrollmentId] !== undefined || noteDrafts[row.enrollmentId] !== undefined;
          const amount = row.invoice && !row.editable ? row.invoice.amount : sessions * row.pricePerSession;
          return (
            <li
              key={row.enrollmentId}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 ${dirty ? "bg-amber-50/50" : ""}`}
            >
              {/* Học sinh đã lưu trữ thì không gửi lên: server cũng bỏ qua. */}
              {!row.studentArchived ? <input type="hidden" name="enrollmentId" value={row.enrollmentId} /> : null}
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold">{row.studentName}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                  <span className="font-mono">{row.phone}</span>
                  {row.monthlyStatus === "on_leave" ? (
                    <Badge tone="warning">Bảo lưu</Badge>
                  ) : row.invoice ? (
                    <Badge tone={INVOICE_STATUS[row.invoice.status].tone}>{INVOICE_STATUS[row.invoice.status].label}</Badge>
                  ) : (
                    <Badge>Chưa tạo hóa đơn</Badge>
                  )}
                  {row.studentArchived ? <Badge tone="neutral">Đã lưu trữ</Badge> : null}
                </div>
                {row.enrolledClasses.length > 0 ? (
                  <p className="mt-1 text-xs text-stone-500">
                    Đang học:{" "}
                    {row.enrolledClasses.map((item, index) => (
                      <span key={`${item.name}-${index}`}>
                        {index > 0 ? ", " : ""}
                        <span className={item.current ? "font-semibold text-primary" : "text-stone-700"}>
                          {item.name}
                        </span>
                      </span>
                    ))}
                  </p>
                ) : null}
                {row.joinHint && row.editable ? (
                  <p className="mt-1 text-[11px] font-medium text-amber-700">
                    Vào lớp {row.joinHint.joinedOn} · lịch còn {row.joinHint.sessions} buổi
                    {sessions !== row.joinHint.sessions ? (
                      <button
                        type="button"
                        className="ml-1 underline hover:text-amber-900"
                        onClick={() => setSessions(row, row.joinHint!.sessions)}
                      >
                        Dùng {row.joinHint.sessions} buổi
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="flex items-center gap-3">
                {row.editable ? (
                  <div className="flex items-center">
                    <button
                      type="button"
                      className="focus-ring grid h-11 w-11 place-items-center rounded-l-xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                      onClick={() => setSessions(row, sessions - 1)}
                      disabled={saving || sessions <= 0}
                      aria-label={`Giảm số buổi của ${row.studentName}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <input
                      name={`sessions:${row.enrollmentId}`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={MAX_SESSIONS}
                      value={sessions}
                      onChange={(event) => setSessions(row, Number(event.target.value))}
                      onFocus={(event) => event.target.select()}
                      disabled={saving}
                      aria-label={`Số buổi của ${row.studentName}`}
                      className="focus-ring h-11 w-14 border-y border-stone-300 bg-white text-center text-base font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      className="focus-ring grid h-11 w-11 place-items-center rounded-r-xl border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                      onClick={() => setSessions(row, sessions + 1)}
                      disabled={saving || sessions >= MAX_SESSIONS}
                      aria-label={`Tăng số buổi của ${row.studentName}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <span
                    className="inline-flex h-11 items-center gap-1 px-2 font-bold text-stone-600"
                    title="Hóa đơn đã đóng, hủy, miễn hoặc học sinh bảo lưu: không sửa số buổi"
                  >
                    <Lock className="h-3.5 w-3.5 text-stone-400" />
                    {row.monthlyStatus === "on_leave" ? 0 : sessions} buổi
                  </span>
                )}
                <span className="w-24 text-right text-sm font-semibold text-stone-700">{formatCurrency(amount)}</span>
              </div>

              <div className="basis-full">
                {row.studentArchived ? (
                  row.note ? <p className="text-xs text-stone-600">Ghi chú: {row.note}</p> : null
                ) : (
                  <Input
                    name={`note:${row.enrollmentId}`}
                    value={noteDrafts[row.enrollmentId] ?? row.note}
                    onChange={(event) => setNote(row, event.target.value)}
                    maxLength={NOTE_MAX_LENGTH}
                    disabled={saving}
                    placeholder="Ghi chú (vd: nghỉ 2 buổi, học bù ngày 15…)"
                    aria-label={`Ghi chú của ${row.studentName}`}
                    className="h-10"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 z-10 grid gap-3 border-t border-stone-200 bg-stone-50/95 px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur sm:flex sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-stone-600">
          {state.error ? (
            <span className="font-semibold text-warning">{state.error}</span>
          ) : dirtyCount > 0 ? (
            `Đã sửa ${dirtyCount} học sinh, chưa lưu.`
          ) : (
            "Bấm −/+ hoặc gõ số buổi, thêm ghi chú rồi lưu."
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {dirtyCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => {
                setSessionDrafts({});
                setNoteDrafts({});
              }}
            >
              <RotateCcw className="h-4 w-4" />
              Hoàn tác
            </Button>
          ) : null}
          <Button type="submit" disabled={saving || dirtyCount === 0} className="flex-1 sm:flex-none">
            <Check className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </div>
    </form>
  );
}
