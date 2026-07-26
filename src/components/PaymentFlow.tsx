"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  FileClock,
  Home,
  Info,
  Loader2,
  PauseCircle,
  Printer,
  QrCode,
  RefreshCw
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

type InvoiceStatus = "paid" | "unpaid" | "void" | "waived";

type Invoice = {
  id: string;
  month: number;
  year: number;
  amount: number;
  memoContent: string;
  status: InvoiceStatus;
  qrImageUrl: string;
};

type Student = {
  id: string;
  fullName: string;
  invoices: Invoice[];
};

/** Thông tin dựng biên lai, lấy từ /api/pay/invoices/[id] khi hoá đơn đã đóng. */
type Receipt = {
  status: InvoiceStatus;
  amount: number;
  month: number;
  year: number;
  paidAt: string | null;
  studentName: string;
  className: string;
  classShortCode: string;
  teacherName: string;
  memoContent: string;
  paymentMethod: "bank_transfer" | "cash" | null;
  receiptRef: string | null;
};

/** Ngừng poll sau 15 phút không có biến động để tab bỏ quên không gọi API mãi. */
const POLL_INTERVAL_MS = 4000;
const POLL_BUDGET_MS = 15 * 60 * 1000;

function StepBadge({ n }: { n: number }) {
  return (
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gradient-to-b from-indigo-600 to-primary text-xs font-bold text-white shadow-sm">
      {n}
    </span>
  );
}

function CopyMemoButton({ memo }: { memo: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(memo);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard không khả dụng — bỏ qua */
        }
      }}
      className="focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-2.5 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-50"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Đã chép" : "Sao chép"}
    </button>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-soft print:border-stone-300 print:shadow-none">
      <div className="flex items-center gap-3 border-b border-emerald-100 bg-emerald-50/70 p-5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-neutralText">Đã nhận thanh toán</h2>
          <p className="text-sm text-stone-600">Biên lai học phí {formatMonth(receipt.month, receipt.year)}</p>
        </div>
      </div>

      <dl className="grid gap-0 p-5 text-sm">
        {[
          ["Học sinh", receipt.studentName],
          ["Lớp", `${receipt.className}${receipt.classShortCode ? ` (${receipt.classShortCode})` : ""}`],
          ...(receipt.teacherName ? [["Giáo viên", receipt.teacherName] as const] : []),
          ["Kỳ học phí", formatMonth(receipt.month, receipt.year)],
          ["Thời điểm nhận", formatDateTime(receipt.paidAt)],
          [
            "Hình thức",
            receipt.paymentMethod === "cash"
              ? "Tiền mặt tại trung tâm"
              : receipt.paymentMethod === "bank_transfer"
                ? "Chuyển khoản ngân hàng"
                : "Trung tâm xác nhận"
          ],
          ...(receipt.receiptRef && !receipt.receiptRef.startsWith("CASH-")
            ? ([["Mã giao dịch", receipt.receiptRef] as const])
            : []),
          ["Nội dung", receipt.memoContent]
        ].map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 border-b border-stone-100 py-2.5 last:border-b-0"
          >
            <dt className="shrink-0 text-stone-500">{label}</dt>
            <dd className="text-right font-semibold text-neutralText">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center justify-between gap-3 border-t border-emerald-100 bg-emerald-50/50 px-5 py-4">
        <span className="text-sm font-semibold text-stone-600">Số tiền đã nhận</span>
        <strong className="text-2xl font-bold text-success">{formatCurrency(receipt.amount)}</strong>
      </div>

      <div className="p-5 pt-4 print:hidden">
        <Button type="button" variant="secondary" className="w-full" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          In / Lưu biên lai
        </Button>
      </div>
    </section>
  );
}

export function PaymentFlow({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, InvoiceStatus>>({});
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [paused, setPaused] = useState(false);
  const selected = useMemo(
    () => students.find((student) => student.id === studentId) ?? null,
    [studentId, students]
  );

  const pendingIds = useMemo(() => {
    if (!selected) return [] as string[];
    return selected.invoices
      .filter((invoice) => (statuses[invoice.id] ?? invoice.status) === "unpaid")
      .map((invoice) => invoice.id);
  }, [selected, statuses]);

  // Ref để vòng poll đọc danh sách mới nhất mà không phải khởi động lại timer.
  const pendingRef = useRef(pendingIds);
  pendingRef.current = pendingIds;

  const fetchStatuses = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const response = await fetch(`/api/pay/invoices/${id}`, { cache: "no-store" });
          if (!response.ok) return null;
          return [id, (await response.json()) as Receipt] as const;
        } catch {
          return null;
        }
      })
    );

    const valid = results.filter((entry): entry is readonly [string, Receipt] => entry !== null);
    if (valid.length === 0) return;

    setStatuses((current) => ({
      ...current,
      ...Object.fromEntries(valid.map(([id, data]) => [id, data.status]))
    }));
    setReceipts((current) => ({
      ...current,
      ...Object.fromEntries(valid.filter(([, data]) => data.status === "paid"))
    }));
  }, []);

  // Phụ huynh mở lại link sau khi đã đóng: nạp biên lai gần nhất một lần, không poll.
  const loadedReceiptIds = useRef(new Set<string>());
  useEffect(() => {
    if (!confirmed || !selected || pendingIds.length > 0) return;
    const latestPaid = selected.invoices.find(
      (invoice) => (statuses[invoice.id] ?? invoice.status) === "paid"
    );
    if (!latestPaid || loadedReceiptIds.current.has(latestPaid.id)) return;
    loadedReceiptIds.current.add(latestPaid.id);
    void fetchStatuses([latestPaid.id]);
  }, [confirmed, selected, pendingIds.length, statuses, fetchStatuses]);

  useEffect(() => {
    if (!confirmed || !selected || paused) return;
    if (pendingIds.length === 0) return;

    let cancelled = false;
    let timer: number | undefined;
    const startedAt = Date.now();

    const tick = async () => {
      // Tab bị ẩn: không gọi API, chờ sự kiện visibilitychange đánh thức lại.
      if (document.hidden) return;
      await fetchStatuses(pendingRef.current);
      if (cancelled) return;
      if (pendingRef.current.length === 0) return;
      if (Date.now() - startedAt > POLL_BUDGET_MS) {
        setPaused(true);
        return;
      }
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== undefined) window.clearTimeout(timer);
        timer = undefined;
        return;
      }
      // Quay lại tab: kiểm tra ngay rồi chạy lại nhịp bình thường.
      if (!cancelled && timer === undefined) void tick();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    void tick();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [confirmed, selected, paused, pendingIds.length, fetchStatuses]);

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-soft">
        <p className="font-semibold">Lớp này chưa có học sinh.</p>
      </div>
    );
  }

  const visibleInvoices = selected
    ? selected.invoices.map((invoice) => ({
        ...invoice,
        status: statuses[invoice.id] ?? invoice.status
      }))
    : [];
  const unpaidInvoices = visibleInvoices.filter((invoice) => invoice.status === "unpaid");
  // Chỉ hiện biên lai cho hoá đơn vừa chuyển sang đã đóng ngay trên màn hình này.
  const freshReceipts = visibleInvoices
    .filter((invoice) => invoice.status === "paid" && receipts[invoice.id])
    .map((invoice) => receipts[invoice.id]);

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft print:hidden">
        <div className="flex items-center gap-2.5">
          <StepBadge n={1} />
          <p className="text-base font-bold">Chọn tên học sinh</p>
        </div>
        <select
          value={studentId}
          onChange={(event) => {
            setStudentId(event.target.value);
            setConfirmed(false);
            setPaused(false);
          }}
          className="focus-ring mt-3 h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base shadow-sm transition-colors hover:border-stone-400 focus:border-primary"
        >
          <option value="" disabled>
            Tên học sinh
          </option>
          {students.map((student) => (
            <option key={student.id} value={student.id}>
              {student.fullName}
            </option>
          ))}
        </select>
        <Button
          type="button"
          className="mt-4 h-12 w-full text-base"
          disabled={!studentId}
          onClick={() => setConfirmed(true)}
        >
          Tiếp theo
          <ArrowRight className="h-5 w-5" />
        </Button>
      </section>

      {freshReceipts.map((receipt) => (
        <ReceiptCard key={`${receipt.memoContent}-${receipt.paidAt}`} receipt={receipt} />
      ))}

      {!confirmed ? (
        <section className="flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-sm text-stone-600">
          <QrCode className="h-5 w-5 shrink-0 text-stone-400" />
          Chọn đúng tên học sinh rồi bấm <strong className="font-semibold text-neutralText">Tiếp theo</strong> để xem học phí và mã QR.
        </section>
      ) : visibleInvoices.length === 0 ? (
        <section className="rounded-2xl border border-amber-100 bg-white p-8 text-center shadow-soft">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-amber-50 text-amber-700">
            <FileClock className="h-9 w-9" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Chưa phát hành hóa đơn</h2>
          <p className="mt-2 text-stone-600">Trung tâm chưa tạo học phí cho học sinh này.</p>
        </section>
      ) : unpaidInvoices.length === 0 ? (
        freshReceipts.length > 0 ? null : (
          <section className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-soft">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-success">
              <CheckCircle2 className="h-9 w-9" />
            </span>
            <h2 className="mt-4 text-xl font-bold">Không còn khoản cần thanh toán</h2>
            <p className="mt-2 text-stone-600">Các hóa đơn đã được thanh toán hoặc trung tâm đã xử lý.</p>
            <Link href="/" className="mt-6 inline-block">
              <Button type="button" variant="secondary">
                <Home className="h-4 w-4" />
                Về trang chủ
              </Button>
            </Link>
          </section>
        )
      ) : (
        unpaidInvoices.map((invoice) => (
          <section key={invoice.id} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft print:hidden">
            <div className="flex items-start justify-between gap-3 p-5 pb-0">
              <div className="flex items-center gap-2.5">
                <StepBadge n={2} />
                <div>
                  <p className="text-xs font-semibold text-stone-500">Chuyển khoản học phí</p>
                  <h2 className="text-xl font-bold tracking-tight">{formatMonth(invoice.month, invoice.year)}</h2>
                </div>
              </div>
              <Badge tone="warning" dot>Chưa đóng</Badge>
            </div>

            <div className="m-5 grid gap-3 rounded-xl border border-stone-200/70 bg-stone-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-stone-600">Số tiền cần đóng</span>
                <strong className="text-xl font-bold text-warning">{formatCurrency(invoice.amount)}</strong>
              </div>
              <div className="h-px bg-stone-200/80" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-stone-600">Nội dung chuyển khoản</span>
                  <CopyMemoButton memo={invoice.memoContent} />
                </div>
                <p className="mt-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2 font-mono text-sm font-semibold tracking-tight text-primary">
                  {invoice.memoContent}
                </p>
              </div>
            </div>

            <div className="px-5">
              <div className="mx-auto w-fit rounded-2xl border border-stone-200 bg-white p-3 shadow-sm">
                <img
                  src={invoice.qrImageUrl}
                  alt={`Ma QR thanh toan ${invoice.memoContent}`}
                  className="aspect-square w-full max-w-64 rounded-lg object-contain"
                />
              </div>
              <p className="mt-2 text-center text-xs text-stone-400">Quét mã QR bằng app ngân hàng bất kỳ</p>
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-sm text-indigo-800">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>
                  Phụ huynh chỉ cần quét mã QR rồi chuyển khoản, <strong>không cần sửa nội dung chuyển khoản</strong>.
                </p>
              </div>
            </div>

            <div className="p-5">
              {paused ? (
                <div className="grid gap-3">
                  <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                    <PauseCircle className="h-4 w-4" />
                    Đã tạm dừng kiểm tra tự động.
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setPaused(false);
                      void fetchStatuses(pendingRef.current);
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Kiểm tra lại
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang chờ xác nhận thanh toán...
                </div>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
