"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { updateClassDetailsAction } from "@/lib/actions/billing";
import { EMPTY_RESULT_STATE, type ResultState } from "@/lib/action-states";
import { toast } from "@/components/Toaster";
import { Button, Input } from "@/components/ui";
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
// Chấm màu trước tên thay cho nhãn trạng thái để mỗi học sinh nằm gọn trên một dòng.
const STATUS_DOT = {
  on_leave: { label: "Bảo lưu", className: "bg-amber-400" },
  none: { label: "Chưa tạo hóa đơn", className: "bg-stone-300" },
  unpaid: { label: "Hóa đơn chưa đóng", className: "bg-rose-500" },
  paid: { label: "Đã đóng", className: "bg-emerald-500" },
  void: { label: "Hóa đơn đã hủy", className: "bg-stone-400" },
  waived: { label: "Đã miễn", className: "bg-indigo-400" }
} as const;

// Từ màn hình vừa (md) trở lên là bảng có cột cố định; điện thoại giữ bố cục một dòng gọn.
const TABLE_COLUMNS =
  "md:grid md:grid-cols-[minmax(0,1.5fr)_112px_minmax(0,1.2fr)_minmax(0,2fr)_112px_96px] md:items-center md:gap-4";

function statusKey(row: SessionRow): keyof typeof STATUS_DOT {
  if (row.monthlyStatus === "on_leave") return "on_leave";
  return row.invoice?.status ?? "none";
}

function classListNodes(row: SessionRow) {
  return row.enrolledClasses.map((item, index) => (
    <span key={`${item.name}-${index}`}>
      {index > 0 ? ", " : ""}
      <span className={item.current ? "font-semibold text-primary" : undefined}>{item.name}</span>
    </span>
  ));
}

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
        <div className="flex basis-full flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500">
          {(["none", "unpaid", "paid", "on_leave"] as const).map((key) => (
            <span key={key} className="inline-flex items-center gap-1">
              <span className={`h-2 w-2 rounded-full ${STATUS_DOT[key].className}`} />
              {STATUS_DOT[key].label}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`hidden border-b border-stone-100 bg-stone-50/70 px-6 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 ${TABLE_COLUMNS}`}
      >
        <span>Học sinh</span>
        <span>SĐT</span>
        <span>Lớp đang học</span>
        <span>Ghi chú</span>
        <span className="text-center">Số buổi</span>
        <span className="text-right">Thành tiền</span>
      </div>

      <ul className="divide-y divide-stone-100">
        {rows.map((row) => {
          const sessions = sessionsOf(row);
          const dirty = sessionDrafts[row.enrollmentId] !== undefined || noteDrafts[row.enrollmentId] !== undefined;
          const amount = row.invoice && !row.editable ? row.invoice.amount : sessions * row.pricePerSession;
          return (
            <li
              key={row.enrollmentId}
              className={`flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-6 ${TABLE_COLUMNS} ${dirty ? "bg-amber-50/50" : ""}`}
            >
              {/* Học sinh đã lưu trữ thì không gửi lên: server cũng bỏ qua. */}
              {!row.studentArchived ? <input type="hidden" name="enrollmentId" value={row.enrollmentId} /> : null}

              {/* Học sinh: tên + trạng thái; dòng phụ là các lớp đang học (hoặc gợi ý số buổi khi vào giữa tháng). */}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[statusKey(row)].className}`}
                    title={STATUS_DOT[statusKey(row)].label}
                    aria-label={STATUS_DOT[statusKey(row)].label}
                  />
                  <span className="truncate text-sm font-semibold" title={`${row.studentName} · ${row.phone}`}>
                    {row.studentName}
                  </span>
                </div>
                {row.joinHint && row.editable && sessions !== row.joinHint.sessions ? (
                  <button
                    type="button"
                    className="block max-w-full truncate text-left text-[11px] font-medium text-amber-700 underline"
                    onClick={() => setSessions(row, row.joinHint!.sessions)}
                  >
                    Vào {row.joinHint.joinedOn} · dùng {row.joinHint.sessions} buổi
                  </button>
                ) : (
                  <p className="truncate text-[11px] text-stone-500 md:hidden">{classListNodes(row)}</p>
                )}
              </div>

              <span className="hidden truncate text-sm text-stone-600 md:block">{row.phone}</span>
              <p
                className="hidden truncate text-sm text-stone-600 md:block"
                title={row.enrolledClasses.map((item) => item.name).join(", ")}
              >
                {classListNodes(row)}
              </p>

              <div className="w-28 shrink-0 sm:w-auto sm:flex-1 md:min-w-0">
                {row.studentArchived ? (
                  <p className="truncate text-xs text-stone-500" title={row.note}>{row.note || "-"}</p>
                ) : (
                  <Input
                    name={`note:${row.enrollmentId}`}
                    value={noteDrafts[row.enrollmentId] ?? row.note}
                    onChange={(event) => setNote(row, event.target.value)}
                    maxLength={NOTE_MAX_LENGTH}
                    disabled={saving}
                    placeholder="Ghi chú"
                    aria-label={`Ghi chú của ${row.studentName}`}
                    className="h-9 px-2.5"
                  />
                )}
              </div>

              <div className="shrink-0 md:justify-self-center">
                {row.editable ? (
                  <div className="flex items-center">
                    <button
                      type="button"
                      className="focus-ring grid h-9 w-8 place-items-center rounded-l-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 sm:w-9"
                      onClick={() => setSessions(row, sessions - 1)}
                      disabled={saving || sessions <= 0}
                      aria-label={`Giảm số buổi của ${row.studentName}`}
                    >
                      <Minus className="h-3.5 w-3.5" />
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
                      className="focus-ring h-9 w-10 border-y border-stone-300 bg-white text-center text-sm font-bold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      className="focus-ring grid h-9 w-8 place-items-center rounded-r-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 sm:w-9"
                      onClick={() => setSessions(row, sessions + 1)}
                      disabled={saving || sessions >= MAX_SESSIONS}
                      aria-label={`Tăng số buổi của ${row.studentName}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <span
                    className="inline-flex h-9 w-[104px] items-center justify-center gap-1 text-sm font-bold text-stone-500 sm:w-[112px]"
                    title="Hóa đơn đã đóng, hủy, miễn hoặc học sinh bảo lưu: không sửa số buổi"
                  >
                    <Lock className="h-3.5 w-3.5 text-stone-400" />
                    {row.monthlyStatus === "on_leave" ? 0 : sessions}
                  </span>
                )}
              </div>

              <span className="hidden w-24 shrink-0 text-right text-sm font-semibold text-stone-700 sm:block md:w-auto">
                {formatCurrency(amount)}
              </span>
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
