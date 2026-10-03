"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, Percent, Send } from "lucide-react";
import { applyClassPercentToMonthAction, recordSalaryPayoutAction } from "@/lib/actions/finance";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { MoneyInput } from "@/components/MoneyInput";
import { toast } from "@/components/Toaster";
import { Button, Field, Input } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

export type PayoutOption = {
  key: string;
  classId: string;
  className: string;
  shortCode: string;
  month: number;
  year: number;
  due: number;
  paidOut: number;
  /** Phải trả − đã chuyển (âm = đã chuyển dư). */
  remaining: number;
  waitingCount: number;
};

function todayInput() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });
}

/** Nút mở hộp thoại ghi số tiền đã chuyển cho một giáo viên (một hoặc nhiều lớp/kỳ). */
export function SalaryPayoutButton({
  teacherName,
  options,
  initialKeys,
  label,
  variant = "accent",
  compact = false
}: {
  teacherName: string;
  options: PayoutOption[];
  initialKeys: string[];
  label: string;
  variant?: "accent" | "secondary";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={compact ? "h-8 whitespace-nowrap px-2.5 text-xs" : "h-10 whitespace-nowrap px-3.5"}
        onClick={() => setOpen(true)}
      >
        <Send className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {label}
      </Button>
      {open ? (
        <PayoutDialog
          teacherName={teacherName}
          options={options}
          initialKeys={initialKeys}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function PayoutDialog({
  teacherName,
  options,
  initialKeys,
  onClose
}: {
  teacherName: string;
  options: PayoutOption[];
  initialKeys: string[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(recordSalaryPayoutAction, EMPTY_RESULT_STATE);
  const [selected, setSelected] = useState(() => new Set(initialKeys));
  const [amounts, setAmounts] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(options.map((option) => [option.key, option.remaining || null]))
  );
  const [paidAt, setPaidAt] = useState(todayInput);

  // Ghi xong thì báo và đóng hộp thoại (chỉ chạy một lần cho mỗi kết quả của action).
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    onClose();
  }, [state]);

  const chosen = options.filter((option) => selected.has(option.key) && amounts[option.key]);
  const total = chosen.reduce((sum, option) => sum + (amounts[option.key] ?? 0), 0);
  const overpaid = chosen.filter((option) => (amounts[option.key] ?? 0) > Math.max(0, option.remaining));
  const linesJson = JSON.stringify(
    chosen.map((option) => ({
      classId: option.classId,
      month: option.month,
      year: option.year,
      amount: amounts[option.key]
    }))
  );

  function toggle(option: PayoutOption) {
    const next = new Set(selected);
    if (next.has(option.key)) next.delete(option.key);
    else {
      next.add(option.key);
      if (!amounts[option.key]) setAmounts((value) => ({ ...value, [option.key]: option.remaining || null }));
    }
    setSelected(next);
  }

  return (
    <Modal
      title={`Ghi chuyển lương · ${teacherName || "giáo viên"}`}
      onClose={() => !pending && onClose()}
      closeDisabled={pending}
      maxWidthClassName="max-w-2xl"
    >
      <form action={action} className="grid gap-4">
        <input type="hidden" name="lines" value={linesJson} />
        <p className="text-sm text-stone-600">
          Tick các lớp/kỳ trong lần chuyển này và sửa số tiền nếu chuyển một phần. Số còn thiếu sẽ hiện là
          <strong> còn nợ</strong> ở đúng tháng đó để chuyển bù sau.
        </p>

        <div className="grid gap-2">
          {options.map((option) => {
            const checked = selected.has(option.key);
            const amount = amounts[option.key] ?? 0;
            return (
              <div
                key={option.key}
                className={`grid items-center gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_180px] ${
                  checked ? "border-indigo-200 bg-indigo-50/40" : "border-stone-200 bg-white"
                }`}
              >
                <label className="flex cursor-pointer items-center gap-3 sm:contents">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-indigo-600"
                    checked={checked}
                    onChange={() => toggle(option)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-neutralText">
                      {option.className} · T{option.month}/{option.year}
                    </span>
                    <span className="block text-xs text-stone-500">
                      Phải trả {formatCurrency(option.due)} · đã chuyển {formatCurrency(option.paidOut)} ·{" "}
                      {option.remaining >= 0 ? (
                        <span className="font-semibold text-warning">còn nợ {formatCurrency(option.remaining)}</span>
                      ) : (
                        <span className="font-semibold text-primary">chuyển dư {formatCurrency(-option.remaining)}</span>
                      )}
                      {option.waitingCount > 0 ? ` · chờ ${option.waitingCount} HS nộp` : ""}
                    </span>
                  </span>
                </label>
                <MoneyInput
                  aria-label={`Số tiền chuyển ${option.className} T${option.month}/${option.year}`}
                  value={amounts[option.key] ?? null}
                  onValueChange={(value) => setAmounts((current) => ({ ...current, [option.key]: value }))}
                  allowNegative
                  disabled={!checked || pending}
                  className={checked && amount !== option.remaining ? "border-amber-300" : ""}
                />
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Ngày chuyển">
            <Input
              type="date"
              name="paidAt"
              value={paidAt}
              max={todayInput()}
              onChange={(event) => setPaidAt(event.target.value)}
              required
            />
          </Field>
          <Field label="Ghi chú" hint="Không bắt buộc">
            <Input name="note" maxLength={300} placeholder="VD: 2 bạn nộp muộn, chuyển bù tháng sau" />
          </Field>
        </div>

        {overpaid.length > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {overpaid.map((option) => `${option.className} T${option.month}`).join(", ")}: chuyển nhiều hơn số còn nợ —
            phần dư sẽ hiện là <strong>ứng trước</strong> và tự cân lại khi học sinh nộp thêm.
          </p>
        ) : null}

        {state.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-4">
          <p className="text-sm text-stone-600">
            Tổng lần này:{" "}
            <strong className={`text-lg ${total < 0 ? "text-primary" : "text-neutralText"}`}>
              {formatCurrency(total)}
            </strong>
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending || chosen.length === 0}>
              <Check className="h-4 w-4" />
              {pending ? "Đang ghi..." : "Ghi đã chuyển"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/** Nút chép một đoạn văn bản (vd bảng lương gửi giáo viên) vào clipboard. */
export function CopyTextButton({ text, label, successMessage }: { text: string; label: string; successMessage: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(successMessage);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Trình duyệt không cho chép tự động. Hãy thử lại hoặc dùng trình duyệt khác.");
    }
  }

  return (
    <Button type="button" variant="secondary" className="h-10 whitespace-nowrap px-3.5" onClick={copy}>
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      {label}
    </Button>
  );
}

/** Tháng bị khóa % khác % của lớp: hỏi lại rồi chuyển tháng đó về % hiện tại của lớp. */
export function MonthPercentFixButton({
  classId,
  className,
  month,
  year,
  lockedPercent,
  classPercent
}: {
  classId: string;
  className: string;
  month: number;
  year: number;
  lockedPercent: number;
  classPercent: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await applyClassPercentToMonthAction(classId, month, year);
        if (result.error) toast.error(result.error);
        else toast.success(result.success);
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      } finally {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 hover:bg-amber-100"
        title={`Tháng này đang khóa ${lockedPercent}% theo lần chuyển đầu, lớp hiện để ${classPercent}%`}
      >
        <Percent className="h-3 w-3" />
        Khóa {lockedPercent}% · dùng {classPercent}%
      </button>
      {open ? (
        <Modal title="Sửa % của tháng lương" onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4 text-sm text-stone-600">
            <p>
              Lương <strong>{className}</strong> T{month}/{year} đang tính theo <strong>{lockedPercent}%</strong> (khóa
              theo lần chuyển đầu tiên). Chuyển sang <strong>{classPercent}%</strong> như % hiện tại của lớp? Số phải
              trả và còn nợ của tháng này sẽ tính lại; các lần chuyển đã ghi giữ nguyên.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="button" disabled={pending} onClick={confirm}>
                <Check className="h-4 w-4" />
                {pending ? "Đang lưu..." : `Dùng ${classPercent}%`}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
