"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, FilePlus2, Lock, Minus, Pencil, Plus, Search, X } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { updateClassDetailsAction } from "@/lib/actions/billing";
import { EMPTY_RESULT_STATE, type ResultState } from "@/lib/action-states";
import { InvoiceLifecycleActions } from "@/components/InvoiceLifecycleActions";
import { toast } from "@/components/Toaster";
import { LeaveClassButton } from "@/components/LeaveClassButton";
import { Badge, Button, Input, Select } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { NOTE_MAX_LENGTH } from "@/lib/validation";
import { matchesName } from "@/lib/student-search";

type InvoiceRow = {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  phone: string;
  studentArchived: boolean;
  monthlyStatus: "active" | "on_leave";
  periodInitialized: boolean;
  invoice: null | {
    id: string;
    month: number;
    year: number;
    sessions: number;
    pricePerSession: number;
    amount: number;
    /** Tiền thực nhận khi đã đóng (khác amount nếu gán lệch tiền). */
    paidAmount: number | null;
    memoContent: string;
    status: "paid" | "unpaid" | "void" | "waived";
    statusReason: string | null;
  };
  defaultSessions: number;
  /** Số buổi khôi phục khi bật lại "Đang học" từ trạng thái bảo lưu (số buổi đang là 0). */
  fallbackSessions: number;
  /** Cách tính số buổi gợi ý theo thời khóa biểu (kỳ chưa khởi tạo), vd "8 theo lịch − 1 nghỉ T10". */
  sessionsHint: string;
  /** Lý do trừ/cộng buổi (đã lưu trên hóa đơn, hoặc dự kiến cho kỳ chưa tạo). */
  sessionsNote: string;
  /** Hóa đơn chưa đóng của các tháng trước trong lớp này. */
  olderDebts: Array<{ month: number; year: number; amount: number }>;
  pricePerSession: number;
  memoContent: string;
  /** Hậu tố memo dự kiến (B, C, ...) khi trùng SĐT với học sinh khác cùng lớp; rỗng = memo gốc. */
  memoSuffix: string;
  /** Ghi chú của học sinh trong lớp cho kỳ đang xem. */
  note: string;
};

const PAGE_SIZE = 10;

type RowFilter = "all" | "unpaid" | "paid" | "not_created" | "on_leave" | "older_debt";
const ROW_FILTERS: Array<{ key: RowFilter; label: string; test: (row: InvoiceRow) => boolean }> = [
  { key: "all", label: "Tất cả", test: () => true },
  { key: "unpaid", label: "Chưa đóng", test: (row) => row.invoice?.status === "unpaid" },
  { key: "paid", label: "Đã đóng", test: (row) => row.invoice?.status === "paid" },
  {
    key: "not_created",
    label: "Chưa tạo HĐ",
    test: (row) => !row.invoice && row.monthlyStatus === "active" && !row.studentArchived
  },
  { key: "on_leave", label: "Bảo lưu", test: (row) => row.monthlyStatus === "on_leave" },
  { key: "older_debt", label: "Nợ tháng trước", test: (row) => row.olderDebts.length > 0 }
];

/** Tên gõ không dấu, hoặc một đoạn SĐT (bỏ dấu cách/chấm). */
function matchesRow(row: InvoiceRow, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/[\s.-]/g, "");
  if (/^\d+$/.test(digits)) return row.phone.replace(/\D/g, "").includes(digits);
  return matchesName(row.studentName, trimmed);
}
const INVOICE_STATUS = {
  unpaid: { label: "Chưa đóng", tone: "warning" },
  paid: { label: "Đã đóng", tone: "success" },
  void: { label: "Đã hủy", tone: "neutral" },
  waived: { label: "Đã miễn", tone: "primary" }
} as const;

export function ClassInvoiceEditor({
  classId,
  month,
  year,
  rows,
  billingLocked = false,
  canManage = true
}: {
  classId: string;
  month: number;
  year: number;
  rows: InvoiceRow[];
  billingLocked?: boolean;
  /** false = quản lý phụ: chỉ sửa số buổi và ghi chú, không tạo hóa đơn, đổi tình trạng học hay thao tác hóa đơn. */
  canManage?: boolean;
}) {
  const hasAnyInvoice = rows.some((row) => row.invoice);
  const missingInvoiceCount = rows.filter(
    (row) => !row.studentArchived && !row.invoice && row.monthlyStatus === "active"
  ).length;
  const hasMissingInvoice = canManage && missingInvoiceCount > 0;
  const [editing, setEditing] = useState(false);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RowFilter>("all");
  const [sessionDrafts, setSessionDrafts] = useState<Record<string, number>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  // ±1 buổi cả lớp: tổng số buổi đã cộng/trừ (để hiện) và lý do gửi kèm khi lưu.
  const [bulkDelta, setBulkDelta] = useState(0);
  const [bulkReason, setBulkReason] = useState("");
  const resetDrafts = () => {
    setSessionDrafts({});
    setNoteDrafts({});
    setBulkDelta(0);
    setBulkReason("");
  };
  const [saveState, saveAction, saving] = useActionState(
    async (prevState: ResultState, formData: FormData) => {
      const result = await updateClassDetailsAction(prevState, formData);
      // Action không redirect nên component không mount lại: tự thoát chế độ sửa.
      if (result.success) {
        setEditing(false);
        resetDrafts();
        toast.success(result.success);
      }
      return result;
    },
    EMPTY_RESULT_STATE
  );
  const router = useRouter();
  // Nạp lại sau khi đã hết "Đang lưu..." (action không revalidatePath, xem src/lib/actions/shared.ts).
  useEffect(() => {
    if (saveState.success) router.refresh();
  }, [saveState, router]);
  useEffect(() => {
    if (!billingLocked) return;
    setEditing(false);
    resetDrafts();
  }, [billingLocked]);
  /**
   * Cộng/trừ 1 buổi cho mọi học sinh còn sửa được (đang học, hóa đơn chưa đóng hoặc chưa tạo).
   * Chỉ đổi số trên màn hình; bấm Lưu mới ghi. Bỏ qua học sinh đã đóng/hủy/miễn, bảo lưu, lưu trữ.
   */
  const adjustAll = (delta: 1 | -1) => {
    let changed = 0;
    let skipped = 0;
    const next = { ...sessionDrafts };
    for (const row of rows) {
      const invoice = row.invoice;
      const planningLocked = billingLocked || row.studentArchived || Boolean(invoice && invoice.status !== "unpaid");
      if (planningLocked || row.monthlyStatus !== "active") {
        skipped += 1;
        continue;
      }
      const key = invoice?.id ?? row.enrollmentId;
      const current = next[key] ?? invoice?.sessions ?? row.defaultSessions;
      const value = Math.min(60, Math.max(1, current + delta));
      if (value === current) {
        skipped += 1;
        continue;
      }
      next[key] = value;
      changed += 1;
    }
    if (changed === 0) {
      toast.info("Không có học sinh nào đổi được số buổi.");
      return;
    }
    setSessionDrafts(next);
    setBulkDelta((value) => value + delta);
    toast.info(
      `${delta > 0 ? "Cộng" : "Trừ"} 1 buổi cho ${changed} học sinh${skipped > 0 ? `, bỏ qua ${skipped} (đã đóng/hủy/miễn, bảo lưu hoặc lưu trữ)` : ""}. Bấm "Lưu thay đổi" để ghi.`
    );
  };

  const summary = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          const invoice = row.invoice;
          if (invoice?.status === "void" || invoice?.status === "waived") return acc;

          const draftKey = invoice?.id ?? row.enrollmentId;
          const planningLocked = billingLocked || row.studentArchived || Boolean(invoice && invoice.status !== "unpaid");
          const sessions = planningLocked
            ? invoice?.sessions ?? row.defaultSessions
            : sessionDrafts[draftKey] ?? invoice?.sessions ?? row.defaultSessions;
          if (invoice) {
            const amount = planningLocked || sessionDrafts[draftKey] === undefined
              ? invoice.amount
              : sessions * invoice.pricePerSession;
            if (invoice.status === "paid") acc.paid += invoice.paidAmount ?? invoice.amount;
            if (invoice.status === "unpaid") acc.unpaid += amount;
          } else if (!billingLocked && !row.studentArchived && row.monthlyStatus === "active") {
            acc.planned += sessions * row.pricePerSession;
          }
          return acc;
        },
        { paid: 0, unpaid: 0, planned: 0 }
      ),
    [billingLocked, rows, sessionDrafts]
  );
  const issuedAmount = summary.paid + summary.unpaid;
  // Số thứ tự theo cả lớp, giữ nguyên khi tìm/lọc.
  const orderByEnrollment = new Map(rows.map((row, index) => [row.enrollmentId, index + 1]));
  const searchedRows = rows.filter((row) => matchesRow(row, query));
  const filterCounts = new Map(
    ROW_FILTERS.map((item) => [item.key, searchedRows.filter(item.test).length] as const)
  );
  const activeFilter = ROW_FILTERS.find((item) => item.key === filter) ?? ROW_FILTERS[0];
  const filteredRows = searchedRows.filter(activeFilter.test);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const visibleIds = new Set(visibleRows.map((row) => row.enrollmentId));
  const formId = `class-details-${classId}-${month}-${year}`;
  const submitLabel = editing
    ? "Lưu thay đổi"
    : hasMissingInvoice
    ? `Tạo ${missingInvoiceCount} hóa đơn`
    : hasAnyInvoice
      ? "Lưu thay đổi"
      : "Tạo hóa đơn tháng này";

  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <div className="flex flex-col gap-4 border-b border-stone-200/80 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold">Chi tiết {formatMonth(month, year)}</h3>
          <div className="mt-2 grid grid-cols-1 gap-y-1 text-sm text-stone-500 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-4">
            <span>
              Đã phát hành: <strong className="text-lg text-primary">{formatCurrency(issuedAmount)}</strong>
            </span>
            <span>
              Đã nộp: <strong className="text-lg text-success">{formatCurrency(summary.paid)}</strong>
            </span>
            <span>
              Công nợ: <strong className="text-lg text-warning">{formatCurrency(summary.unpaid)}</strong>
            </span>
            {summary.planned > 0 ? (
              <span>
                Kế hoạch chưa phát hành: <strong className="text-stone-700">{formatCurrency(summary.planned)}</strong>
              </span>
            ) : null}
            {billingLocked ? (
              <span className="justify-self-start rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-600 ring-1 ring-inset ring-stone-500/15">
                Lớp đã lưu trữ · không phát hành mới
              </span>
            ) : hasMissingInvoice ? (
              <span className="justify-self-start rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15">
                Cần tạo {missingInvoiceCount} hóa đơn
              </span>
            ) : canManage && !hasAnyInvoice ? (
              <span className="justify-self-start rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/15">
                Dự thảo
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {editing ? (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => {
                  resetDrafts();
                  setEditing(false);
                }}
            >
              <X className="h-4 w-4" />
              Hủy
            </Button>
            </>
          ) : !billingLocked ? (
            <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" />
              {!canManage ? "Sửa số buổi" : hasMissingInvoice ? "Sửa trước khi tạo" : hasAnyInvoice ? "Sửa" : "Sửa dự thảo"}
            </Button>
          ) : null}
        </div>
      </div>

      {rows.length > 3 ? (
        <div className="flex flex-col gap-2 border-b border-stone-200/80 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
          <label className="relative block w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Tìm tên hoặc SĐT"
              aria-label="Tìm học sinh theo tên hoặc số điện thoại"
              autoComplete="off"
              className="focus-ring h-9 w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 text-sm shadow-sm placeholder:text-stone-400 hover:border-stone-400 focus:border-primary"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc học sinh">
            {ROW_FILTERS.map((item) => {
              const count = filterCounts.get(item.key) ?? 0;
              if (item.key !== "all" && count === 0 && filter !== item.key) return null;
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setFilter(item.key);
                    setPage(1);
                  }}
                  className={`focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors ${
                    active
                      ? "bg-primary text-white ring-primary"
                      : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {item.label}
                  <span className={`tabular-nums ${active ? "text-white/80" : "text-stone-400"}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <form id={formId} action={saveAction}>
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="year" value={year} />
        {bulkDelta !== 0 && bulkReason.trim() ? <input type="hidden" name="sessionsReason" value={bulkReason.trim()} /> : null}
        {editing && !billingLocked ? (
          <div className="flex flex-col gap-2 border-b border-stone-200/80 bg-stone-50 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-6">
            <span className="text-sm font-semibold text-stone-700">Cả lớp:</span>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" disabled={saving} onClick={() => adjustAll(-1)}>
                <Minus className="h-4 w-4" />1 buổi
              </Button>
              <Button type="button" variant="secondary" disabled={saving} onClick={() => adjustAll(1)}>
                <Plus className="h-4 w-4" />1 buổi
              </Button>
              {bulkDelta !== 0 ? (
                <span className="text-sm font-semibold text-amber-700">
                  Đã {bulkDelta > 0 ? "cộng" : "trừ"} {Math.abs(bulkDelta)} buổi, chưa lưu
                </span>
              ) : null}
            </div>
            <Input
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
              maxLength={120}
              placeholder="Lý do (vd: Nghỉ 15/11) – hiện trong tin gửi phụ huynh"
              className="w-full sm:max-w-sm"
            />
          </div>
        ) : null}
        {saveState.error && !billingLocked && (editing || hasMissingInvoice) ? (
          <div className="border-b border-rose-100 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700">
            {saveState.error}
          </div>
        ) : null}
        {rows
          .filter((row) => !visibleIds.has(row.enrollmentId))
          .map((row) => {
            const draftKey = row.invoice?.id ?? row.enrollmentId;
            const planningLocked =
              billingLocked || row.studentArchived || Boolean(row.invoice && row.invoice.status !== "unpaid");
            const sessions = planningLocked
              ? row.invoice?.sessions ?? row.defaultSessions
              : sessionDrafts[draftKey] ?? row.invoice?.sessions ?? row.defaultSessions;
            return (
              <div key={row.enrollmentId} className="hidden">
                <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                <input type="hidden" name={`status:${row.enrollmentId}`} value={row.monthlyStatus} />
                <input type="hidden" name={`sessions:${row.enrollmentId}`} value={sessions} />
                {noteDrafts[row.enrollmentId] !== undefined ? (
                  <input type="hidden" name={`note:${row.enrollmentId}`} value={noteDrafts[row.enrollmentId]} />
                ) : null}
              </div>
            );
          })}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[9%]" />
              <col className="w-[11%]" />
              <col className="w-[13%]" />
              <col className="w-[19%]" />
            </colgroup>
            <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-2 py-3 text-center">#</th>
                <th className="px-2 py-3">Học sinh</th>
                <th className="px-2 py-3">Trạng thái học</th>
                <th className="px-2 py-3">Hóa đơn</th>
                <th className="px-2 py-3">Số buổi</th>
                <th className="px-2 py-3">Đơn giá</th>
                <th className="px-2 py-3">Số tiền</th>
                <th className="px-2 py-3">Ghi chú</th>
                <th className="px-2 py-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visibleRows.map((row) => {
                const invoice = row.invoice;
                const isPaid = invoice?.status === "paid";
                const isLocked = Boolean(invoice && invoice.status !== "unpaid");
                const planningLocked = billingLocked || row.studentArchived || isLocked;
                const draftKey = invoice?.id ?? row.enrollmentId;
                const sessions = planningLocked
                  ? invoice?.sessions ?? row.defaultSessions
                  : sessionDrafts[draftKey] ?? invoice?.sessions ?? row.defaultSessions;
                const displayUnitPrice = invoice?.pricePerSession ?? row.pricePerSession;
                const displayAmount = invoice && (planningLocked || sessionDrafts[draftKey] === undefined)
                  ? invoice.amount
                  : sessions * displayUnitPrice;
                return (
                  <tr
                    key={row.enrollmentId}
                    className={`transition-colors ${isPaid ? "bg-emerald-50/30" : editing && !row.studentArchived ? "bg-amber-50/30" : "hover:bg-stone-50"}`}
                  >
                    <td className="px-2 py-3 text-center tabular-nums text-stone-400">
                      {orderByEnrollment.get(row.enrollmentId)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <input type="hidden" name="enrollmentId" value={row.enrollmentId} />
                      <Link
                        href={`/admin/students/${row.studentId}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {row.studentName}
                      </Link>
                      <div className="text-xs text-stone-500">{row.phone}</div>
                      {row.olderDebts.map((debt) => (
                        <Link
                          key={`${debt.year}-${debt.month}`}
                          href={`/admin/classes?classId=${classId}&month=${debt.month}&year=${debt.year}`}
                          className="block whitespace-normal text-[11px] font-semibold text-warning hover:underline"
                          title="Bấm để mở tháng đó, hoặc thu ở trang Công nợ"
                        >
                          Còn nợ T{debt.month}/{debt.year}: {formatCurrency(debt.amount)}
                        </Link>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <div className="grid gap-1">
                        {canManage && editing && !planningLocked ? (
                          <Select
                            name={`status:${row.enrollmentId}`}
                            defaultValue={row.monthlyStatus}
                            className="w-full min-w-0"
                            onChange={(event) => {
                              // Học sinh bảo lưu có số buổi 0; bật lại "Đang học" thì
                              // khôi phục ngay mức mặc định để không phải nhớ nhập tay.
                              if (event.target.value !== "active") return;
                              setSessionDrafts((current) => {
                                const draft = current[draftKey] ?? invoice?.sessions ?? row.defaultSessions;
                                if (draft > 0) return current;
                                return { ...current, [draftKey]: row.fallbackSessions };
                              });
                            }}
                          >
                            <option value="active">Đang học</option>
                            <option value="on_leave">Bảo lưu</option>
                          </Select>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <input type="hidden" name={`status:${row.enrollmentId}`} value={row.monthlyStatus} />
                            {planningLocked ? <Lock className="h-3.5 w-3.5 text-stone-500" /> : null}
                            <span className={row.monthlyStatus === "active" ? "font-semibold text-neutralText" : "font-semibold text-amber-700"}>
                              {row.monthlyStatus === "active" ? "Đang học" : "Bảo lưu"}
                            </span>
                          </span>
                        )}
                        {!row.periodInitialized ? (
                          <span className="whitespace-normal text-[11px] font-medium text-amber-700">
                            Chưa khởi tạo tháng
                          </span>
                        ) : null}
                        {row.studentArchived ? (
                          <span className="whitespace-normal text-[11px] font-medium text-stone-500">
                            Học sinh đã lưu trữ · kế hoạch được khóa
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {invoice ? (
                        <div>
                          <Badge tone={INVOICE_STATUS[invoice.status].tone}>
                            {INVOICE_STATUS[invoice.status].label}
                          </Badge>
                          {invoice.statusReason ? (
                            <p className="mt-1 max-w-40 whitespace-normal text-xs text-stone-500" title={invoice.statusReason}>
                              {invoice.statusReason}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <Badge>Chưa tạo</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {editing && !planningLocked ? (
                        // Controlled để ô số buổi cập nhật được khi đổi trạng thái học.
                        <Input
                          name={`sessions:${row.enrollmentId}`}
                          type="number"
                          min="0"
                          value={sessions}
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
                          {planningLocked ? <Lock className="h-3.5 w-3.5 text-stone-500" /> : null}
                          {sessions}
                        </span>
                      )}
                      {row.sessionsHint && row.monthlyStatus === "active" ? (
                        <p className="mt-1 whitespace-normal text-[11px] font-medium text-stone-500">{row.sessionsHint}</p>
                      ) : null}
                      {row.sessionsNote && row.monthlyStatus === "active" ? (
                        <p className="mt-0.5 whitespace-normal text-[11px] font-medium text-amber-700" title={row.sessionsNote}>
                          {row.sessionsNote}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-stone-600">
                      {formatCurrency(displayUnitPrice)}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">
                      <strong className={invoice?.status === "paid" ? "text-success" : invoice?.status === "unpaid" ? "text-warning" : "text-stone-500"}>
                        {formatCurrency(displayAmount)}
                      </strong>
                      {invoice?.status === "paid" && invoice.paidAmount !== null && invoice.paidAmount !== invoice.amount ? (
                        <div className="text-[11px] font-semibold text-amber-700" title="Giao dịch được gán lệch số tiền hóa đơn">
                          Thực thu {formatCurrency(invoice.paidAmount)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-2 py-3">
                      {editing && !billingLocked && !row.studentArchived ? (
                        <Input
                          name={`note:${row.enrollmentId}`}
                          value={noteDrafts[row.enrollmentId] ?? row.note}
                          maxLength={NOTE_MAX_LENGTH}
                          placeholder="Ghi chú"
                          onChange={(event) =>
                            setNoteDrafts((current) => ({ ...current, [row.enrollmentId]: event.target.value }))
                          }
                          className="w-full min-w-0"
                        />
                      ) : row.note ? (
                        <p className="line-clamp-2 whitespace-normal text-xs text-stone-600" title={row.note}>
                          {row.note}
                        </p>
                      ) : (
                        <span className="text-xs text-stone-400">-</span>
                      )}
                    </td>
                    {/* Quản lý phụ cũng cho nghỉ lớp được; miễn/hủy hóa đơn chỉ của chủ. */}
                    <td className="whitespace-nowrap px-2 py-3 text-right">
                      <div className="flex flex-nowrap items-center justify-end gap-1">
                      {!billingLocked && !row.studentArchived ? (
                        <LeaveClassButton
                          enrollmentId={row.enrollmentId}
                          studentName={row.studentName}
                          month={month}
                          year={year}
                          paidThisMonth={invoice?.status === "paid"}
                          unpaidThisMonth={invoice?.status === "unpaid"}
                          disabled={editing}
                        />
                      ) : null}
                      {!canManage ? null : invoice?.status === "unpaid" ? (
                        <InvoiceLifecycleActions invoiceId={invoice.id} status="unpaid" disabled={editing} />
                      ) : invoice?.status === "paid" ? (
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-semibold text-success">
                          <Lock className="h-3.5 w-3.5" />
                          Đã khóa
                        </span>
                      ) : invoice ? (
                        <InvoiceLifecycleActions invoiceId={invoice.id} status={invoice.status} disabled={editing} />
                      ) : (
                        <span className="text-xs text-stone-400">-</span>
                      )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-500">
              Không có học sinh khớp tìm kiếm/bộ lọc.{" "}
              <button
                type="button"
                className="font-semibold text-primary hover:underline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                  setPage(1);
                }}
              >
                Xóa lọc
              </button>
            </p>
          ) : null}
        </div>

        <Pagination
          page={currentPage}
          totalPages={totalPages}
          total={filteredRows.length}
          pageSize={PAGE_SIZE}
          itemLabel="học sinh"
          hideWhenSingle
          onChange={setPage}
        />

        {!billingLocked && (editing || hasMissingInvoice) ? (
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-stone-50/95 px-5 py-4 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] backdrop-blur">
            <p className="text-sm text-stone-600">
              {editing
                ? canManage
                  ? "Lưu hoặc hủy bản nháp trước khi ghi nhận tiền hay đổi trạng thái hóa đơn."
                  : "Sửa số buổi và ghi chú rồi bấm Lưu. Hóa đơn đã đóng, hủy, miễn hoặc học sinh bảo lưu không sửa được số buổi."
                : hasMissingInvoice
                ? "Tạo hóa đơn cho các học sinh đang học chưa có hóa đơn trong tháng này. Có thể sửa số buổi trước khi tạo."
                : "Chỉ sửa số buổi và trạng thái học cho hóa đơn chưa đóng. Hóa đơn đã đóng, hủy hoặc miễn được khóa để giữ đúng lịch sử."}
            </p>
            <Button type="submit" name="intent" value={editing ? "save" : "create"} disabled={saving}>
              {editing ? <Check className="h-4 w-4" /> : hasMissingInvoice || !hasAnyInvoice ? <FilePlus2 className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {saving ? "Đang lưu..." : submitLabel}
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
