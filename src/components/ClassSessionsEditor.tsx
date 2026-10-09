"use client";

import { useActionState, useMemo, useState } from "react";
import { Check, FilePlus2, Lock, Minus, Plus, RotateCcw } from "lucide-react";
import { updateClassDetailsAction } from "@/lib/actions/billing";
import { EMPTY_RESULT_STATE, type ResultState } from "@/lib/action-states";
import { toast } from "@/components/Toaster";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

type SessionRow = {
  enrollmentId: string;
  studentName: string;
  phone: string;
  monthlyStatus: "active" | "on_leave";
  studentArchived: boolean;
  editable: boolean;
  sessions: number;
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
 * Nhập số buổi theo tháng cho quản lý phụ. Chỉ gửi những học sinh còn sửa được (đang học,
 * chưa có hóa đơn hoặc hóa đơn chưa đóng); server vẫn tự kiểm tra lại quyền và trạng thái.
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
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [state, action, saving] = useActionState(
    async (prevState: ResultState, formData: FormData) => {
      const result = await updateClassDetailsAction(prevState, formData);
      if (result.success) {
        setDrafts({});
        toast.success(result.success);
      } else if (result.error) {
        toast.error(result.error);
      }
      return result;
    },
    EMPTY_RESULT_STATE
  );

  const sessionsOf = (row: SessionRow) => drafts[row.enrollmentId] ?? row.sessions;
  const setSessions = (row: SessionRow, value: number) =>
    setDrafts((current) => {
      const next = { ...current };
      const clamped = clamp(value);
      if (clamped === row.sessions) delete next[row.enrollmentId];
      else next[row.enrollmentId] = clamped;
      return next;
    });

  const editableRows = rows.filter((row) => row.editable);
  const missingCount = editableRows.filter((row) => !row.invoice).length;
  const dirtyCount = Object.keys(drafts).length;
  const total = useMemo(
    () =>
      rows.reduce((sum, row) => {
        if (!row.editable) {
          const billed = row.invoice?.status === "paid" || row.invoice?.status === "unpaid";
          return billed ? sum + row.invoice!.amount : sum;
        }
        return sum + (drafts[row.enrollmentId] ?? row.sessions) * row.pricePerSession;
      }, 0),
    [drafts, rows]
  );

  return (
    <form action={action}>
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />

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
          const dirty = drafts[row.enrollmentId] !== undefined;
          const amount = row.invoice && !row.editable ? row.invoice.amount : sessions * row.pricePerSession;
          return (
            <li
              key={row.enrollmentId}
              className={`flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 ${dirty ? "bg-amber-50/50" : ""}`}
            >
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
                    <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                    <input type="hidden" name={`status:${row.enrollmentId}`} value={row.monthlyStatus} />
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
            </li>
          );
        })}
      </ul>

      {editableRows.length > 0 ? (
        <div className="sticky bottom-0 z-10 grid gap-3 border-t border-stone-200 bg-stone-50/95 px-4 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur sm:flex sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-stone-600">
            {state.error ? (
              <span className="font-semibold text-warning">{state.error}</span>
            ) : dirtyCount > 0 ? (
              `Đã sửa ${dirtyCount} học sinh, chưa lưu.`
            ) : missingCount > 0 ? (
              `${missingCount} học sinh chưa có hóa đơn tháng này.`
            ) : (
              "Bấm −/+ hoặc gõ số buổi rồi lưu."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            {dirtyCount > 0 ? (
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setDrafts({})}>
                <RotateCcw className="h-4 w-4" />
                Hoàn tác
              </Button>
            ) : null}
            {missingCount > 0 ? (
              <>
                <Button type="submit" name="intent" value="save" variant="secondary" disabled={saving || dirtyCount === 0}>
                  <Check className="h-4 w-4" />
                  Chỉ lưu
                </Button>
                <Button type="submit" name="intent" value="create" disabled={saving} className="flex-1 sm:flex-none">
                  <FilePlus2 className="h-4 w-4" />
                  {saving ? "Đang lưu..." : `Lưu & tạo ${missingCount} hóa đơn`}
                </Button>
              </>
            ) : (
              <Button type="submit" name="intent" value="save" disabled={saving || dirtyCount === 0} className="flex-1 sm:flex-none">
                <Check className="h-4 w-4" />
                {saving ? "Đang lưu..." : "Lưu số buổi"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </form>
  );
}
