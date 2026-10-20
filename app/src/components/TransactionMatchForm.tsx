"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  LoaderCircle,
  Search
} from "lucide-react";
import { assignTransactionAction, resolveTransactionAction } from "@/lib/actions";
import { formatCurrency, formatMonth } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { Badge, Button, Field, Input, Textarea } from "@/components/ui";

type InvoiceOption = {
  id: string;
  amount: number;
  sessions: number;
  pricePerSession: number;
  month: number;
  year: number;
  memoContent: string;
  studentName: string;
  studentPhone: string;
  className: string;
  classShortCode: string;
  teacherName: string;
  studentArchived: boolean;
  classArchived: boolean;
};

type SearchResponse = {
  items: InvoiceOption[];
  page: number;
  take: number;
  total: number;
  totalPages: number;
};

type TransactionMatchFormProps = {
  transactionId: string;
  transactionAmount: number;
};

const initialActionState = { error: "", success: "" };
const SEARCH_PAGE_SIZE = 8;

function differenceLabel(transactionAmount: number, invoiceAmount: number) {
  const difference = transactionAmount - invoiceAmount;
  if (difference === 0) return "Khớp đúng số tiền";
  return `GD ${difference > 0 ? "thừa" : "thiếu"} ${formatCurrency(Math.abs(difference))}`;
}

export function TransactionMatchForm({
  transactionId,
  transactionAmount
}: TransactionMatchFormProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [searchMeta, setSearchMeta] = useState({ page: 1, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [assignState, assignAction, assigning] = useActionState(assignTransactionAction, initialActionState);
  const [resolveState, resolveAction, resolving] = useActionState(resolveTransactionAction, initialActionState);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPage(1);
      setDebouncedQuery(query.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    async function searchInvoices() {
      setLoading(true);
      setSearchError("");
      const params = new URLSearchParams({
        q: debouncedQuery,
        amount: String(transactionAmount),
        page: String(page),
        take: String(SEARCH_PAGE_SIZE)
      });

      try {
        const response = await fetch(`/api/admin/invoices/search?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const body = (await response.json()) as SearchResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in body && body.error ? body.error : "Không thể tìm hóa đơn.");
        }

        const result = body as SearchResponse;
        setInvoices(result.items);
        setSearchMeta({ page: result.page, total: result.total, totalPages: result.totalPages });
        setSelectedInvoiceId((current) =>
          result.items.some((invoice) => invoice.id === current) ? current : ""
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setInvoices([]);
        setSelectedInvoiceId("");
        setSearchError(error instanceof Error ? error.message : "Không thể tìm hóa đơn.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void searchInvoices();
    return () => controller.abort();
  }, [debouncedQuery, open, page, transactionAmount]);

  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId),
    [invoices, selectedInvoiceId]
  );
  const difference = selectedInvoice ? transactionAmount - selectedInvoice.amount : 0;
  const hasAmountMismatch = Boolean(selectedInvoice && difference !== 0);
  const searchPending = loading || query.trim() !== debouncedQuery;

  function changeSearch(value: string) {
    setQuery(value);
    setSelectedInvoiceId("");
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    setSelectedInvoiceId("");
  }

  function closeWorkbench() {
    setOpen(false);
    setSelectedInvoiceId("");
    setSearchError("");
  }

  function openWorkbench() {
    setLoading(true);
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-9 whitespace-nowrap"
        onClick={openWorkbench}
      >
        <Search className="h-4 w-4" />
        Mở bàn xử lý
      </Button>
      {open ? (
        <Modal
          title="Bàn xử lý giao dịch"
          onClose={closeWorkbench}
          maxWidthClassName="max-w-3xl"
          closeDisabled={assigning || resolving}
        >
          <div className="grid gap-4">
      <form action={assignAction} className="grid gap-3">
        <input type="hidden" name="transactionId" value={transactionId} />
        <input type="hidden" name="invoiceId" value={selectedInvoiceId} />

        <Field
          label="Tìm hóa đơn chưa đóng"
          hint="Tên, SĐT, memo, tên hoặc mã lớp"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-stone-400" />
            <Input
              type="search"
              value={query}
              maxLength={100}
              onChange={(event) => changeSearch(event.target.value)}
              disabled={assigning}
              autoFocus
              className="pl-10"
              placeholder="Nhập thông tin cần tìm..."
              aria-label="Tìm hóa đơn chưa đóng"
            />
          </div>
        </Field>

        <p className="text-xs text-stone-500">
          Gợi ý được ưu tiên theo số tiền khớp chính xác, sau đó đến mức chênh lệch nhỏ nhất.
        </p>

        {searchPending ? (
          <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Đang tìm hóa đơn...
          </div>
        ) : searchError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-warning" role="alert">
            {searchError}
          </p>
        ) : invoices.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-3 text-sm text-stone-600">
            Không tìm thấy hóa đơn chưa đóng phù hợp.
          </p>
        ) : (
          <div className="grid max-h-80 gap-2 overflow-y-auto pr-1" role="listbox" aria-label="Hóa đơn chưa đóng">
            {invoices.map((invoice) => {
              const selected = invoice.id === selectedInvoiceId;
              const exactAmount = invoice.amount === transactionAmount;
              return (
                <button
                  key={invoice.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => setSelectedInvoiceId(invoice.id)}
                  disabled={assigning}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500/20"
                      : "border-stone-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {invoice.studentName} · {invoice.studentPhone}
                      </p>
                      <p className="mt-0.5 text-xs text-stone-600">
                        {invoice.classShortCode} · {invoice.className} · {formatMonth(invoice.month, invoice.year)}
                      </p>
                    </div>
                    <Badge tone={exactAmount ? "success" : "warning"}>
                      {differenceLabel(transactionAmount, invoice.amount)}
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-stone-600">
                    <p>
                      Snapshot phát hành: {invoice.sessions} buổi × {formatCurrency(invoice.pricePerSession)} ={" "}
                      <strong className="text-stone-800">{formatCurrency(invoice.amount)}</strong>
                    </p>
                    <p className="break-all font-mono">Memo: {invoice.memoContent}</p>
                    {invoice.teacherName ? <p>Giáo viên: {invoice.teacherName}</p> : null}
                    {invoice.studentArchived || invoice.classArchived ? (
                      <p className="font-medium text-amber-700">
                        Khoản nợ cũ · {invoice.studentArchived ? "học sinh đã lưu trữ" : ""}
                        {invoice.studentArchived && invoice.classArchived ? " · " : ""}
                        {invoice.classArchived ? "lớp đã lưu trữ" : ""}
                      </p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {!searchPending && !searchError && searchMeta.total > 0 ? (
          <div className="flex items-center justify-between gap-2 text-xs text-stone-600">
            <span>{searchMeta.total} hóa đơn phù hợp</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => changePage(Math.max(1, searchMeta.page - 1))}
                disabled={assigning || searchPending || searchMeta.page <= 1}
                className="focus-ring rounded-lg border border-stone-300 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Trang hóa đơn trước"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span>
                {searchMeta.page}/{searchMeta.totalPages}
              </span>
              <button
                type="button"
                onClick={() => changePage(Math.min(searchMeta.totalPages, searchMeta.page + 1))}
                disabled={assigning || searchPending || searchMeta.page >= searchMeta.totalPages}
                className="focus-ring rounded-lg border border-stone-300 p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Trang hóa đơn sau"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}

        {selectedInvoice ? (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-sm text-indigo-950">
            Đã chọn <strong>{selectedInvoice.studentName}</strong> · {selectedInvoice.classShortCode} ·{" "}
            {formatMonth(selectedInvoice.month, selectedInvoice.year)} · {formatCurrency(selectedInvoice.amount)}
          </div>
        ) : null}

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
                maxLength={500}
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

        <Button type="submit" disabled={assigning || searchPending || !selectedInvoiceId}>
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
              maxLength={500}
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
        </Modal>
      ) : null}
    </>
  );
}
