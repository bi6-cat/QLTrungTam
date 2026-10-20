"use client";

import { useActionState, useState } from "react";
import { RotateCcw, Unlink } from "lucide-react";
import { reverseTransactionAction, unassignTransactionAction } from "@/lib/actions";
import { Modal } from "@/components/Modal";
import { Button, Field, Textarea } from "@/components/ui";

type OpenDialog = "unassign" | "reverse" | null;

const initialActionState = { error: "", success: "" };

export function TransactionReviewActions({ transactionId }: { transactionId: string }) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);

  return (
    <>
      <div className="flex items-center gap-1 whitespace-nowrap">
        <Button
          type="button"
          variant="secondary"
          className="h-8 w-8 shrink-0 px-0"
          onClick={() => setOpenDialog("unassign")}
          aria-label="Bỏ gán giao dịch"
          title="Bỏ gán"
        >
          <Unlink className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="danger"
          className="h-8 w-8 shrink-0 px-0"
          onClick={() => setOpenDialog("reverse")}
          aria-label="Hoàn tác giao dịch"
          title="Hoàn tác"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      {openDialog === "unassign" ? (
        <UnassignDialog transactionId={transactionId} onClose={() => setOpenDialog(null)} />
      ) : null}
      {openDialog === "reverse" ? (
        <ReverseDialog transactionId={transactionId} onClose={() => setOpenDialog(null)} />
      ) : null}
    </>
  );
}

function UnassignDialog({ transactionId, onClose }: { transactionId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(unassignTransactionAction, initialActionState);

  return (
    <Modal title="Bỏ gán giao dịch?" onClose={onClose} closeDisabled={pending}>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="transactionId" value={transactionId} />
        <p className="text-sm text-stone-600">
          Hóa đơn sẽ trở lại trạng thái chưa đóng và giao dịch sẽ được đưa về danh sách chờ xử lý.
        </p>
        <Field label="Lý do bỏ gán">
          <Textarea
            name="reason"
            required
            disabled={pending}
            placeholder="Mô tả ngắn lý do cần bỏ liên kết này..."
            autoFocus
          />
        </Field>

        {state.error ? (
          <p className="text-sm font-medium text-warning" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm font-medium text-success" role="status">
            {state.success}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Đóng
          </Button>
          <Button type="submit" variant="danger" disabled={pending || Boolean(state.success)}>
            <Unlink className="h-4 w-4" />
            {pending ? "Đang bỏ gán..." : "Xác nhận bỏ gán"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReverseDialog({ transactionId, onClose }: { transactionId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(reverseTransactionAction, initialActionState);

  return (
    <Modal title="Hoàn tác giao dịch?" onClose={onClose} closeDisabled={pending}>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="transactionId" value={transactionId} />
        <p className="text-sm text-stone-600">
          Giao dịch sẽ được đánh dấu đã hoàn tác và không còn được tính là khoản thanh toán hợp lệ. Lịch sử vẫn
          được giữ lại để đối soát.
        </p>
        <Field label="Lý do hoàn tác">
          <Textarea
            name="reason"
            required
            disabled={pending}
            placeholder="Ví dụ: Ngân hàng hoàn tiền, ghi nhận nhầm giao dịch..."
            autoFocus
          />
        </Field>

        {state.error ? (
          <p className="text-sm font-medium text-warning" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.success ? (
          <p className="text-sm font-medium text-success" role="status">
            {state.success}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Đóng
          </Button>
          <Button type="submit" variant="danger" disabled={pending || Boolean(state.success)}>
            <RotateCcw className="h-4 w-4" />
            {pending ? "Đang hoàn tác..." : "Xác nhận hoàn tác"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
