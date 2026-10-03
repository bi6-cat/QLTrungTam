"use client";

import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { recordCashPaymentAction } from "@/lib/actions/billing";
import { Button } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { formatCurrency } from "@/lib/format";

/**
 * Thu tiền mặt một hóa đơn. Bấm hai lần (Tiền mặt → Xác nhận thu …) để tránh bấm nhầm;
 * dùng chung ở trang Công nợ và bảng hóa đơn của lớp.
 */
export function DebtCashButton({
  invoiceId,
  amount,
  disabled = false,
  disabledTitle
}: {
  invoiceId: string;
  amount: number;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        // Action trả kèm dữ liệu mới nên khoản nợ tự cập nhật trên trang.
        const result = await recordCashPaymentAction(invoiceId);
        if (result.error) setError(result.error);
        else toast.success(result.success);
      } catch {
        setError("Không kết nối được máy chủ. Vui lòng tải lại trang.");
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1">
      {confirming && !disabled ? (
        <>
          <Button type="button" className="h-8 px-2 text-xs" disabled={pending} onClick={submit}>
            {pending ? "Đang ghi..." : `Xác nhận thu ${formatCurrency(amount)}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={pending}
            onClick={() => setConfirming(false)}
          >
            Hủy
          </Button>
        </>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
          disabled={disabled}
          onClick={() => setConfirming(true)}
          title={disabled ? disabledTitle : "Ghi nhận phụ huynh đã nộp tiền mặt cho khoản này"}
        >
          <Banknote className="h-3.5 w-3.5" />
          Tiền mặt
        </Button>
      )}
      {error ? <span className="text-xs font-medium text-warning">{error}</span> : null}
    </span>
  );
}
