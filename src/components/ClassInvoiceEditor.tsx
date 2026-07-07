"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Check, ChevronLeft, ChevronRight, FilePlus2, Lock, Pencil, X } from "lucide-react";
import { updateClassDetailsAction } from "@/lib/actions";
import { Badge, Button, Input, Select } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

type InvoiceRow = {
  enrollmentId: string;
  studentName: string;
  phone: string;
  enrollmentStatus: "active" | "on_leave";
  invoice: null | {
    id: string;
    month: number;
    year: number;
    sessions: number;
    pricePerSession: number;
    amount: number;
    memoContent: string;
    status: "paid" | "unpaid";
  };
  defaultSessions: number;
  pricePerSession: number;
  memoContent: string;
};

const PAGE_SIZE = 10;

export function ClassInvoiceEditor({
  classId,
  month,
  year,
  rows
}: {
  classId: string;
  month: number;
  year: number;
  rows: InvoiceRow[];
}) {
  const router = useRouter();
  const hasAnyInvoice = rows.some((row) => row.invoice);
  const missingInvoiceCount = rows.filter((row) => !row.invoice && row.enrollmentStatus === "active").length;
  const hasMissingInvoice = missingInvoiceCount > 0;
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, number>>({});
  const [cashSubmittingId, setCashSubmittingId] = useState<string | null>(null);
  const [cashError, setCashError] = useState("");
  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          if (row.enrollmentStatus !== "active") return acc;
        const draftKey = row.invoice?.id ?? row.enrollmentId;
        const sessions = sessionDrafts[draftKey] ?? row.invoice?.sessions ?? row.defaultSessions;
          const amount = sessions * row.pricePerSession;
          acc.expected += amount;
          if (row.invoice?.status === "paid") {
            acc.paid += amount;
          }
          return acc;
        },
        { expected: 0, paid: 0 }
      ),
    [rows, sessionDrafts]
  );
  const remainingAmount = Math.max(0, summary.expected - summary.paid);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = new Set(visibleRows.map((row) => row.enrollmentId));
  const formId = `class-details-${classId}-${month}-${year}`;
  const submitLabel = editing
    ? "Lưu thay đổi"
    : hasMissingInvoice
    ? `Tạo ${missingInvoiceCount} hóa đơn`
    : hasAnyInvoice
      ? "Lưu thay đổi"
      : "Tạo hóa đơn tháng này";

  async function markCashPaid(invoiceId: string) {
    setCashError("");
    setCashSubmittingId(invoiceId);
    try {
      const response = await fetch(`/api/admin/invoices/${invoiceId}/cash`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || "Không ghi nhận được tiền mặt.");
      }
      router.refresh();
    } catch (error) {
      setCashError(error instanceof Error ? error.message : "Không ghi nhận được tiền mặt.");
      setCashSubmittingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200/80 p-6">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">Chi tiết {formatMonth(month, year)}</h3>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
            <span>
              Cần nộp: <strong className="text-lg text-primary">{formatCurrency(summary.expected)}</strong>
            </span>
            <span>
              Đã nộp: <strong className="text-lg text-success">{formatCurrency(summary.paid)}</strong>
            </span>
            <span>
              Còn lại: <strong className="text-lg text-warning">{formatCurrency(remainingAmount)}</strong>
            </span>
            {hasMissingInvoice ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15">
                Cần tạo {missingInvoiceCount} hóa đơn
              </span>
            ) : !hasAnyInvoice ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15">
                Dự thảo
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSessionDrafts({});
                  setEditing(false);
                }}
            >
              <X className="h-4 w-4" />
              Hủy
            </Button>
            </>
          ) : (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {hasMissingInvoice ? "Sửa trước khi tạo" : hasAnyInvoice ? "Sửa" : "Sửa dự thảo"}
            </Button>
          )}
        </div>
      </div>

      <form id={formId} action={updateClassDetailsAction}>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="year" value={year} />
        {cashError ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
            {cashError}
          </div>
        ) : null}
        {rows
          .filter((row) => !visibleIds.has(row.enrollmentId))
          .map((row) => {
            const draftKey = row.invoice?.id ?? row.enrollmentId;
            const sessions = sessionDrafts[draftKey] ?? row.invoice?.sessions ?? row.defaultSessions;
            return (
              <div key={row.enrollmentId} className="hidden">
                <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                <input type="hidden" name={`status:${row.enrollmentId}`} value={row.enrollmentStatus} />
                <input type="hidden" name={`sessions:${row.enrollmentId}`} value={sessions} />
              </div>
            );
          })}
        <div className="overflow-x-auto lg:overflow-visible">
          <table className="w-full min-w-[780px] table-fixed text-left text-sm lg:min-w-0">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[11%]" />
            </colgroup>
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-2 py-3">Học sinh</th>
                <th className="px-2 py-3">Trạng thái học</th>
                <th className="px-2 py-3">Hóa đơn</th>
                <th className="px-2 py-3">Số buổi</th>
                <th className="px-2 py-3">Đơn giá</th>
                <th className="px-2 py-3">Số tiền</th>
                <th className="px-2 py-3">Memo</th>
                <th className="px-2 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visibleRows.map((row) => {
                const invoice = row.invoice;
                const isPaid = invoice?.status === "paid";
                const draftKey = invoice?.id ?? row.enrollmentId;
                const sessions = sessionDrafts[draftKey] ?? invoice?.sessions ?? row.defaultSessions;
                const displayAmount = sessions * row.pricePerSession;
                return (
                  <tr
                    key={row.enrollmentId}
                    className={`transition-colors ${isPaid ? "bg-emerald-50/30" : editing ? "bg-amber-50/30" : "hover:bg-indigo-50/40"}`}
                  >
                    <td className="whitespace-nowrap px-2 py-3">
                      <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                      <div className="font-semibold">{row.studentName}</div>
                      <div className="text-xs text-stone-500">{row.phone}</div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {editing && !isPaid ? (
                        <Select name={`status:${row.enrollmentId}`} defaultValue={row.enrollmentStatus} className="w-full min-w-0">
                          <option value="active">Đang học</option>
                          <option value="on_leave">Bảo lưu</option>
                        </Select>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <input type="hidden" name={`status:${row.enrollmentId}`} value={row.enrollmentStatus} />
                          {isPaid ? <Lock className="h-3.5 w-3.5 text-success" /> : null}
                          <span className={row.enrollmentStatus === "active" ? "font-semibold text-primary" : "font-semibold text-amber-700"}>
                            {row.enrollmentStatus === "active" ? "Đang học" : "Bảo lưu"}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {invoice ? (
                        <Badge tone={invoice.status === "paid" ? "success" : "warning"}>
                          {invoice.status === "paid" ? "Đã đóng" : "Chưa đóng"}
                        </Badge>
                      ) : (
                        <Badge>Chưa tạo</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {editing && !isPaid ? (
                        <Input
                          name={`sessions:${row.enrollmentId}`}
                          type="number"
                          min="0"
                          defaultValue={sessions}
                          onChange={(event) =>
                            setSessionDrafts((current) => ({
                              ...current,
                              [draftKey]: Number(event.target.value) || 0
                            }))
                          }
                          className="w-full min-w-0"
                        />
                      ) : (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <input type="hidden" name={`sessions:${row.enrollmentId}`} value={sessions} />
                          {isPaid ? <Lock className="h-3.5 w-3.5 text-success" /> : null}
                          {sessions}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-stone-600">
                      {formatCurrency(row.pricePerSession)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <strong className={invoice?.status === "paid" ? "text-success" : "text-warning"}>
                        {formatCurrency(displayAmount)}
                      </strong>
                    </td>
                    <td className="px-2 py-3">
                      <code
                        className="inline-block max-w-full truncate rounded bg-stone-100 px-2 py-1 align-bottom text-xs"
                        title={invoice?.memoContent ?? row.memoContent}
                      >
                        {invoice?.memoContent ?? row.memoContent}
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      {invoice?.status === "unpaid" ? (
                        <Button
                          type="button"
                          variant="secondary"
                          className="ml-auto h-8 w-full px-1 text-xs"
                          disabled={cashSubmittingId === invoice.id}
                          onClick={() => markCashPaid(invoice.id)}
                          title="Ghi nhận học sinh đã nộp tiền mặt"
                        >
                          <Banknote className="h-3.5 w-3.5" />
                          {cashSubmittingId === invoice.id ? "Đang ghi..." : "Tiền mặt"}
                        </Button>
                      ) : invoice?.status === "paid" ? (
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-success">
                          <Lock className="h-3.5 w-3.5" />
                          Đã khóa
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.length > PAGE_SIZE ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-3">
            <p className="text-sm text-stone-600">
              Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, rows.length)} /{" "}
              {rows.length} học sinh
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-stone-600">
                {currentPage}/{totalPages}
              </span>
              <Button
                type="button"
                variant="secondary"
                className="h-9 px-3"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {editing || hasMissingInvoice ? (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/95 px-5 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
            <p className="text-sm text-stone-600">
              {editing
                ? "Lưu thay đổi số buổi và trạng thái học. Thao tác này không tạo hóa đơn mới."
                : hasMissingInvoice
                ? "Tạo hóa đơn cho các học sinh đang học chưa có hóa đơn trong tháng này. Có thể sửa số buổi trước khi tạo."
                : "Chỉ sửa số buổi và trạng thái học cho hóa đơn chưa đóng. Hóa đơn đã đóng được khóa để giữ đúng đối soát."}
            </p>
            <Button type="submit" name="intent" value={editing ? "save" : "create"}>
              {editing ? <Check className="h-4 w-4" /> : hasMissingInvoice || !hasAnyInvoice ? <FilePlus2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {submitLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
