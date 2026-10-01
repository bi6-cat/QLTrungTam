"use client";

import { useState, useTransition } from "react";
import { Banknote } from "lucide-react";
import { recordCashPaymentAction } from "@/lib/actions";
import { Button } from "@/components/ui";
import { formatCurrency } from "@/lib/format";

/**
 * Thu tiền mặt một khoản nợ ngay trên trang Công nợ, không phải đổi về đúng tháng
 * trong màn lớp. Bấm hai lần (Thu tiền mặt → Xác nhận) để tránh bấm nhầm.
 */
export function DebtCashButton({ invoiceId, amount }: { invoiceId: string; amount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      try {
        // Action trả kèm dữ liệu mới nên khoản nợ tự biến mất khỏi danh sách.
        const result = await recordCashPaymentAction(invoiceId);
        if (!result.ok) setError(result.error);
      } catch {
        setError("Không kết nối được máy chủ. Vui lòng tải lại trang.");
      } finally {
        setConfirming(false);
      }
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {confirming ? (
        <>
          <Button type="button" className="h-7 px-2 text-xs" disabled={pending} onClick={submit}>
            {pending ? "Đang ghi..." : `Xác nhận thu ${formatCurrency(amount)}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
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
          className="h-7 px-2 text-xs"
          onClick={() => setConfirming(true)}
          title="Ghi nhận phụ huynh đã nộp tiền mặt cho khoản này"
        >
          <Banknote className="h-3.5 w-3.5" />
          Tiền mặt
        </Button>
      )}
      {error ? <span className="text-xs font-medium text-warning">{error}</span> : null}
    </span>
  );
}
