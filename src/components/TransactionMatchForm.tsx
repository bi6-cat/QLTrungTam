"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, Link as LinkIcon } from "lucide-react";
import { assignTransactionAction, resolveTransactionAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/format";
import { Button, Field, Select, Textarea } from "@/components/ui";

type InvoiceOption = {
  id: string;
  label: string;
  amount: number;
};

type TransactionMatchFormProps = {
  transactionId: string;
  transactionAmount: number;
  invoices: InvoiceOption[];
};

const initialActionState = { error: "", success: "" };

export function TransactionMatchForm({
  transactionId,
  transactionAmount,
  invoices
}: TransactionMatchFormProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(invoices[0]?.id ?? "");
  const [assignState, assignAction, assigning] = useActionState(assignTransactionAction, initialActionState);
  const [resolveState, resolveAction, resolving] = useActionState(resolveTransactionAction, initialActionState);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId),
    [invoices, selectedInvoiceId]
  );
  const difference = selectedInvoice ? transactionAmount - selectedInvoice.amount : 0;
  const hasAmountMismatch = Boolean(selectedInvoice && difference !== 0);

  return (
    <div className="grid gap-4">
      <form action={assignAction} className="grid gap-3">
        <input type="hidden" name="transactionId" value={transactionId} />
        <Field label="Hóa đơn chưa đóng">
          <Select
            name="invoiceId"
            required
            value={selectedInvoiceId}
            onChange={(event) => setSelectedInvoiceId(event.target.value)}
            disabled={invoices.length === 0 || assigning}
          >
            {invoices.length === 0 ? <option value="">Không có hóa đơn phù hợp</option> : null}
            {invoices.map((invoice) => (
              <option key={invoice.id} value={invoice.id}>
                {invoice.label}
              </option>
            ))}
          </Select>
        </Field>

        {hasAmountMismatch ? (
          <div className="grid gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">
              Giao dịch {difference > 0 ? "thừa" : "thiếu"} {formatCurrency(Math.abs(difference))} so với hóa
              đơn. Bạn cần nhập lý do để tiếp tục gán.
            </p>
            <input type="hidden" name="allowAmountMismatch" value="true" />
            <Field label="Lý do gán lệch tiền">
              <Textarea
                name="reason"
                required
                disabled={assigning}
                placeholder="Ví dụ: Phụ huynh chuyển gộp và trung tâm đã đối soát..."
              />
            </Field>
          </div>
        ) : null}

        {assignState.error ? (
          <p className="text-sm font-medium text-warning" role="alert">
            {assignState.error}
          </p>
        ) : null}
        {assignState.success ? (
          <p className="text-sm font-medium text-success" role="status">
            {assignState.success}
          </p>
        ) : null}

        <Button type="submit" disabled={assigning || invoices.length === 0 || !selectedInvoiceId}>
          <LinkIcon className="h-4 w-4" />
          {assigning ? "Đang gán..." : "Gán và đánh dấu đã đóng"}
        </Button>
      </form>

      <div className="border-t border-stone-200 pt-4">
        <form action={resolveAction} className="grid gap-3">
          <input type="hidden" name="transactionId" value={transactionId} />
          <Field label="Lý do xử lý không gán hóa đơn">
            <Textarea
              name="reason"
              required
              disabled={resolving}
              placeholder="Ví dụ: Giao dịch thử, khoản thu không thuộc học phí..."
            />
          </Field>

          {resolveState.error ? (
            <p className="text-sm font-medium text-warning" role="alert">
              {resolveState.error}
            </p>
          ) : null}
          {resolveState.success ? (
            <p className="text-sm font-medium text-success" role="status">
              {resolveState.success}
            </p>
          ) : null}

          <Button type="submit" variant="secondary" disabled={resolving}>
            <CheckCircle2 className="h-4 w-4" />
            {resolving ? "Đang xử lý..." : "Đã xử lý, không gán hóa đơn"}
          </Button>
        </form>
      </div>
    </div>
  );
}
