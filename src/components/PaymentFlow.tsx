"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Search,
  UserRound,
  X,
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
import { matchesName } from "@/lib/student-search";

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
  /** Chỉ có khi lớp có người trùng tên, vd "SĐT …123". */
  hint: string | null;
};

function StudentButton({ student, onSelect }: { student: Student; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(student.id)}
      className="focus-ring flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50 active:bg-indigo-100"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-primary">
        <UserRound className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-base font-semibold leading-snug text-neutralText">{student.fullName}</span>
        {student.hint ? <span className="block text-xs text-stone-500">{student.hint}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-stone-400" />
    </button>
  );
}

const VISIBLE_ROWS = 5;
const TRACK_INSET = 8; // khớp top-2/bottom-2 của thanh cuộn

/**
 * Khung cuộn cao đúng VISIBLE_ROWS dòng, có thanh cuộn tự vẽ luôn hiện (điện thoại thường ẩn thanh
 * cuộn gốc nên phụ huynh không biết còn tên bên dưới). Kéo hoặc chạm vào thanh để nhảy tới vị trí đó.
 */
function ScrollList({ children, rowCount }: { children: React.ReactNode; rowCount: number }) {
  const listRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<number>();
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);

  const updateThumb = useCallback(() => {
    const list = listRef.current;
    if (!list || list.scrollHeight <= list.clientHeight + 1) {
      setThumb(null);
      return;
    }
    const trackHeight = list.clientHeight - TRACK_INSET * 2;
    const height = Math.max(28, (trackHeight * list.clientHeight) / list.scrollHeight);
    const maxScroll = list.scrollHeight - list.clientHeight;
    setThumb({ top: ((trackHeight - height) * list.scrollTop) / maxScroll, height });
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      // Dòng thứ VISIBLE_ROWS + 1 bắt đầu ở đâu thì khung cao tới đó.
      const next = list.children[VISIBLE_ROWS] as HTMLElement | undefined;
      setMaxHeight(next ? next.offsetTop : undefined);
    };
    measure();
    const observer = new ResizeObserver(() => {
      measure();
      updateThumb();
    });
    observer.observe(list);
    if (list.firstElementChild) observer.observe(list.firstElementChild);
    return () => observer.disconnect();
  }, [rowCount, updateThumb]);

  useLayoutEffect(updateThumb, [maxHeight, rowCount, updateThumb]);

  const scrollToPointer = (clientY: number) => {
    const list = listRef.current;
    const track = trackRef.current;
    if (!list || !track || !thumb) return;
    const rect = track.getBoundingClientRect();
    const ratio = (clientY - rect.top - thumb.height / 2) / (rect.height - thumb.height);
    list.scrollTop = Math.min(1, Math.max(0, ratio)) * (list.scrollHeight - list.clientHeight);
  };

  return (
    // min-w-0: khung không được nở theo tên dài nhất, tên dài tự rút gọn "…" trên máy màn hình hẹp.
    <div className="grid min-w-0 gap-1.5">
      <div className="relative min-w-0 rounded-xl border border-stone-200">
        <div
          ref={listRef}
          role="list"
          onScroll={updateThumb}
          style={{ maxHeight }}
          className={`scrollbar-none relative overflow-y-auto overscroll-contain p-1 ${thumb ? "pr-6" : ""}`}
        >
          {children}
        </div>
        {thumb ? (
          <div
            ref={trackRef}
            aria-hidden="true"
            className="absolute bottom-2 right-1 top-2 w-4 cursor-pointer touch-none"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              scrollToPointer(event.clientY);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) scrollToPointer(event.clientY);
            }}
          >
            <div className="absolute inset-y-0 left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-stone-200" />
            <div
              className="absolute left-1/2 w-1.5 -translate-x-1/2 rounded-full bg-primary/70"
              style={{ top: thumb.top, height: thumb.height }}
            />
          </div>
        ) : null}
      </div>
      {thumb ? (
        <p className="text-center text-xs text-stone-500">Vuốt trong khung để xem đủ {rowCount} học sinh</p>
      ) : null}
    </div>
  );
}

/**
 * Chọn học sinh khi lớp đông: ô tìm (gõ không dấu cũng được), danh sách xếp theo tên trong khung
 * cuộn 5 dòng. Bấm vào tên là xem học phí luôn.
 */
function StudentPicker({ students, onSelect }: { students: Student[]; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const results = query.trim() ? students.filter((student) => matchesName(student.fullName, query)) : students;

  return (
    <div className="mt-3 grid min-w-0 gap-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Gõ tên để tìm"
          aria-label="Tìm tên học sinh"
          autoComplete="off"
          enterKeyHint="search"
          className={`focus-ring h-12 w-full rounded-xl border border-stone-300 bg-white pl-11 ${query ? "pr-10" : "pr-3"} text-base shadow-sm transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-primary`}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="focus-ring absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-stone-400 hover:bg-stone-100"
            aria-label="Xóa tìm kiếm"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </label>

      {results.length === 0 ? (
        <p className="rounded-xl border border-stone-200 p-4 text-center text-sm text-stone-500">
          Không thấy tên phù hợp. Thử gõ tên của con (vd &ldquo;khoa&rdquo;), không cần dấu.
        </p>
      ) : (
        <ScrollList rowCount={results.length}>
          {results.map((student) => (
            <div key={student.id} role="listitem">
              <StudentButton student={student} onSelect={onSelect} />
            </div>
          ))}
        </ScrollList>
      )}
    </div>
  );
}

/** Hóa đơn của học sinh đang chọn, tải từ /api/pay/classes/<lớp>/students/<id>. */
type InvoiceLoad =
  | { studentId: string; status: "loading" }
  | { studentId: string; status: "ready"; invoices: Invoice[] }
  | { studentId: string; status: "error" };

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

export function PaymentFlow({
  classSlug,
  students,
  initialStudentId
}: {
  classSlug: string;
  students: Student[];
  initialStudentId?: string;
}) {
  const [studentId, setStudentId] = useState(initialStudentId ?? "");
  const [confirmed, setConfirmed] = useState(Boolean(initialStudentId));
  const [statuses, setStatuses] = useState<Record<string, InvoiceStatus>>({});
  const [receipts, setReceipts] = useState<Record<string, Receipt>>({});
  const [paused, setPaused] = useState(false);
  const [invoiceLoad, setInvoiceLoad] = useState<InvoiceLoad | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Chỉ tải hóa đơn của em vừa chọn, mỗi lần bấm "Tiếp theo" là lấy số liệu mới.
  useEffect(() => {
    if (!confirmed || !studentId) return;
    const controller = new AbortController();
    setInvoiceLoad({ studentId, status: "loading" });
    fetch(
      `/api/pay/classes/${encodeURIComponent(classSlug)}/students/${encodeURIComponent(studentId)}`,
      { cache: "no-store", signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        const body = (await response.json()) as { invoices: Invoice[] };
        setInvoiceLoad({ studentId, status: "ready", invoices: body.invoices });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setInvoiceLoad({ studentId, status: "error" });
      });
    return () => controller.abort();
  }, [confirmed, studentId, classSlug, reloadKey]);

  const selectedInvoices = useMemo(
    () =>
      invoiceLoad?.studentId === studentId && invoiceLoad.status === "ready" ? invoiceLoad.invoices : null,
    [invoiceLoad, studentId]
  );

  const pendingIds = useMemo(() => {
    if (!selectedInvoices) return [] as string[];
    return selectedInvoices
      .filter((invoice) => (statuses[invoice.id] ?? invoice.status) === "unpaid")
      .map((invoice) => invoice.id);
  }, [selectedInvoices, statuses]);

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
    if (!confirmed || !selectedInvoices || pendingIds.length > 0) return;
    const latestPaid = selectedInvoices.find(
      (invoice) => (statuses[invoice.id] ?? invoice.status) === "paid"
    );
    if (!latestPaid || loadedReceiptIds.current.has(latestPaid.id)) return;
    loadedReceiptIds.current.add(latestPaid.id);
    void fetchStatuses([latestPaid.id]);
  }, [confirmed, selectedInvoices, pendingIds.length, statuses, fetchStatuses]);

  useEffect(() => {
    if (!confirmed || !selectedInvoices || paused) return;
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
  }, [confirmed, selectedInvoices, paused, pendingIds.length, fetchStatuses]);

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-soft">
        <p className="font-semibold">Lớp này chưa có học sinh.</p>
      </div>
    );
  }

  const selectedStudent = students.find((student) => student.id === studentId) ?? null;
  const visibleInvoices = selectedInvoices
    ? selectedInvoices.map((invoice) => ({
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
          <p className="text-base font-bold">{confirmed ? "Học sinh" : "Chọn tên học sinh"}</p>
        </div>
        {confirmed && selectedStudent ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-primary shadow-sm">
              <UserRound className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-base font-bold leading-snug text-neutralText">{selectedStudent.fullName}</span>
              {selectedStudent.hint ? <span className="block text-xs text-stone-500">{selectedStudent.hint}</span> : null}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-sm"
              onClick={() => {
                setConfirmed(false);
                setStudentId("");
                setPaused(false);
              }}
            >
              Đổi
            </Button>
          </div>
        ) : (
          <StudentPicker
            students={students}
            onSelect={(id) => {
              setStudentId(id);
              setConfirmed(true);
              setPaused(false);
            }}
          />
        )}
      </section>

      {freshReceipts.map((receipt) => (
        <ReceiptCard key={`${receipt.memoContent}-${receipt.paidAt}`} receipt={receipt} />
      ))}

      {!confirmed ? (
        <section className="flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-sm text-stone-600">
          <QrCode className="h-5 w-5 shrink-0 text-stone-400" />
          Bấm vào tên học sinh để xem học phí và mã QR.
        </section>
      ) : invoiceLoad?.studentId === studentId && invoiceLoad.status === "error" ? (
        <section className="grid gap-3 rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-soft">
          <p className="font-semibold text-neutralText">Chưa tải được học phí, vui lòng thử lại.</p>
          <Button type="button" variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw className="h-4 w-4" />
            Thử lại
          </Button>
        </section>
      ) : !selectedInvoices ? (
        <section className="flex items-center justify-center gap-2 rounded-2xl border border-stone-200/80 bg-white p-6 text-sm text-stone-500 shadow-soft">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải học phí...
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
