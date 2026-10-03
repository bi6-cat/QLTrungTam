"use client";

import { useActionState, useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Send } from "lucide-react";
import { recordSalaryPayoutAction } from "@/lib/actions/finance";
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
  // Mỗi lớp/tháng có thể trả hai phần: chuyển khoản và tiền mặt đưa thêm (như sổ tay).
  const [amounts, setAmounts] = useState<Record<string, { bank: number | null; cash: number | null }>>(() =>
    Object.fromEntries(options.map((option) => [option.key, { bank: option.remaining || null, cash: null }]))
  );
  const [paidAt, setPaidAt] = useState(todayInput);

  // Ghi xong thì báo và đóng hộp thoại (chỉ chạy một lần cho mỗi kết quả của action).
  useEffect(() => {
    if (!state.success) return;
    toast.success(state.success);
    onClose();
  }, [state]);

  const amountOf = (key: string) => (amounts[key]?.bank ?? 0) + (amounts[key]?.cash ?? 0);
  const chosen = options.filter((option) => selected.has(option.key) && amountOf(option.key) !== 0);
  const lines = chosen.flatMap((option) =>
    (["bank", "cash"] as const)
      .filter((part) => amounts[option.key]?.[part])
      .map((part) => ({
        classId: option.classId,
        month: option.month,
        year: option.year,
        amount: amounts[option.key][part],
        method: part === "bank" ? "bank_transfer" : "cash"
      }))
  );
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  const totalCash = lines.filter((line) => line.method === "cash").reduce((sum, line) => sum + (line.amount ?? 0), 0);
  const overpaid = chosen.filter((option) => amountOf(option.key) > Math.max(0, option.remaining));

  function setPart(key: string, part: "bank" | "cash", value: number | null) {
    setAmounts((current) => ({ ...current, [key]: { ...current[key], [part]: value } }));
  }

  function toggle(option: PayoutOption) {
    const next = new Set(selected);
    if (next.has(option.key)) next.delete(option.key);
    else {
      next.add(option.key);
      if (amountOf(option.key) === 0) setPart(option.key, "bank", option.remaining || null);
    }
    setSelected(next);
  }

  return (
    <Modal
      title={`Ghi trả lương · ${teacherName || "giáo viên"}`}
      onClose={() => !pending && onClose()}
      closeDisabled={pending}
      maxWidthClassName="max-w-3xl"
    >
      <form action={action} className="grid gap-4">
        <input type="hidden" name="lines" value={JSON.stringify(lines)} />
        <p className="text-sm text-stone-600">
          Tick các lớp/tháng trả lần này, ghi phần <strong>chuyển khoản</strong> và phần <strong>tiền mặt</strong> (nếu
          có). Trả thiếu thì phần còn lại hiện là <strong>còn thiếu</strong> ở đúng tháng đó để trả bù sau.
        </p>

        <div className="grid gap-2">
          <div className="hidden px-3 text-xs font-semibold uppercase tracking-wide text-stone-500 sm:grid sm:grid-cols-[auto_minmax(0,1fr)_150px_150px] sm:gap-3">
            <span className="w-4" />
            <span>Lớp / tháng</span>
            <span className="text-right">Chuyển khoản</span>
            <span className="text-right">Tiền mặt</span>
          </div>
          {options.map((option) => {
            const checked = selected.has(option.key);
            const paying = amountOf(option.key);
            return (
              <div
                key={option.key}
                className={`grid items-center gap-3 rounded-xl border p-3 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_150px_150px] ${
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
                      Tổng tháng {formatCurrency(option.due)} · đã trả {formatCurrency(option.paidOut)} ·{" "}
                      {option.remaining >= 0 ? (
                        <span className="font-semibold text-warning">còn thiếu {formatCurrency(option.remaining)}</span>
                      ) : (
                        <span className="font-semibold text-primary">trả dư {formatCurrency(-option.remaining)}</span>
                      )}
                      {option.waitingCount > 0 ? ` · chờ ${option.waitingCount} HS nộp` : ""}
                    </span>
                  </span>
                </label>
                <MoneyInput
                  aria-label={`Chuyển khoản ${option.className} T${option.month}/${option.year}`}
                  placeholder="Chuyển khoản"
                  value={amounts[option.key]?.bank ?? null}
                  onValueChange={(value) => setPart(option.key, "bank", value)}
                  allowNegative
                  disabled={!checked || pending}
                  className={checked && paying !== option.remaining ? "border-amber-300" : ""}
                />
                <MoneyInput
                  aria-label={`Tiền mặt ${option.className} T${option.month}/${option.year}`}
                  placeholder="Tiền mặt"
                  value={amounts[option.key]?.cash ?? null}
                  onValueChange={(value) => setPart(option.key, "cash", value)}
                  allowNegative
                  disabled={!checked || pending}
                  className={checked && paying !== option.remaining ? "border-amber-300" : ""}
                />
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
          <Field label="Ngày trả">
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
            {overpaid.map((option) => `${option.className} T${option.month}`).join(", ")}: trả nhiều hơn số còn thiếu —
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
            {totalCash !== 0 ? (
              <span className="ml-1.5 text-xs">
                (CK {formatCurrency(total - totalCash)} + TM {formatCurrency(totalCash)})
              </span>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending || lines.length === 0}>
              <Check className="h-4 w-4" />
              {pending ? "Đang ghi..." : "Ghi đã trả"}
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
