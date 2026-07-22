"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Gift, MoreHorizontal, RotateCcw } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button, Field, Textarea } from "@/components/ui";

type InvoiceStatus = "unpaid" | "void" | "waived";

const COPY = {
  void: {
    title: "Hủy hóa đơn?",
    description: "Dùng khi hóa đơn phát hành sai hoặc không còn hiệu lực. Khoản này sẽ không tính vào công nợ.",
    label: "Xác nhận hủy"
  },
  waived: {
    title: "Miễn học phí?",
    description: "Dùng khi trung tâm chủ động miễn khoản học phí này. Hóa đơn vẫn được giữ trong lịch sử.",
    label: "Xác nhận miễn"
  },
  unpaid: {
    title: "Khôi phục công nợ?",
    description: "Hóa đơn sẽ trở lại trạng thái chưa đóng và phụ huynh có thể quét QR để thanh toán.",
    label: "Khôi phục chưa đóng"
  }
} as const;

export function InvoiceLifecycleActions({
  invoiceId,
  status,
  disabled = false
}: {
  invoiceId: string;
  status: InvoiceStatus;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [chooserOpen, setChooserOpen] = useState(false);
  const [target, setTarget] = useState<InvoiceStatus | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function open(nextTarget: InvoiceStatus) {
    if (disabled) return;
    setChooserOpen(false);
    setReason("");
    setError("");
    setTarget(nextTarget);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || disabled) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}/status`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetStatus: target, reason })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Không thể đổi trạng thái hóa đơn.");
      setTarget(null);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Không thể đổi trạng thái hóa đơn.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="flex shrink-0 flex-nowrap justify-end gap-1">
        {status === "unpaid" ? (
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 px-0"
            disabled={disabled}
            title={disabled ? "Lưu hoặc hủy bản nháp trước khi đổi trạng thái hóa đơn" : "Mở các thao tác khác"}
            aria-label="Mở thao tác khác cho hóa đơn"
            aria-haspopup="dialog"
            aria-expanded={chooserOpen}
            onClick={() => !disabled && setChooserOpen(true)}
          >
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="h-8 shrink-0 whitespace-nowrap px-2 text-xs"
            disabled={disabled}
            title={disabled ? "Lưu hoặc hủy bản nháp trước khi đổi trạng thái hóa đơn" : undefined}
            onClick={() => open("unpaid")}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Khôi phục
          </Button>
        )}
      </div>

      {chooserOpen && status === "unpaid" ? (
        <Modal title="Thao tác hóa đơn" onClose={() => setChooserOpen(false)}>
          <div className="grid gap-3">
            <p className="text-sm text-stone-600">
              Chọn cách xử lý hóa đơn. Mỗi thao tác đều yêu cầu nhập lý do để lưu vào lịch sử đối soát.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-auto w-full justify-start px-4 py-3 text-left"
              onClick={() => open("void")}
            >
              <Ban className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>
                <span className="block">Hủy hóa đơn</span>
                <span className="block text-xs font-normal text-stone-500">Dùng khi hóa đơn phát hành sai hoặc không còn hiệu lực.</span>
              </span>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-auto w-full justify-start px-4 py-3 text-left"
              onClick={() => open("waived")}
            >
              <Gift className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block">Miễn học phí</span>
                <span className="block text-xs font-normal text-stone-500">Dùng khi trung tâm chủ động miễn khoản học phí này.</span>
              </span>
            </Button>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setChooserOpen(false)}>
                Đóng
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {target ? (
        <Modal
          title={COPY[target].title}
          onClose={() => !pending && setTarget(null)}
          closeDisabled={pending}
        >
          <form onSubmit={submit} className="grid gap-4">
            <p className="text-sm text-stone-600">{COPY[target].description}</p>
            <Field label="Lý do">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                required
                maxLength={500}
                disabled={pending || disabled}
                autoFocus
                placeholder="Nhập lý do để lưu vào lịch sử đối soát..."
              />
            </Field>
            {error ? <p className="text-sm font-medium text-warning" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setTarget(null)}>
                Đóng
              </Button>
              <Button
                type="submit"
                variant={target === "void" ? "danger" : "primary"}
                disabled={pending || disabled || !reason.trim()}
              >
                {pending ? "Đang lưu..." : COPY[target].label}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
