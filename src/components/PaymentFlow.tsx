"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, CheckCircle2, Copy, ExternalLink, Home, Info, Loader2, QrCode } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

type BankApp = {
  appId: string;
  appName: string;
  bankName: string;
};

const FALLBACK_BANK_APPS: BankApp[] = [
  { appId: "tcb", appName: "Techcombank Mobile", bankName: "Techcombank" },
  { appId: "vcb", appName: "Vietcombank", bankName: "Vietcombank" },
  { appId: "mb", appName: "MB Bank", bankName: "MB Bank" },
  { appId: "bidv", appName: "BIDV SmartBanking", bankName: "BIDV" },
  { appId: "vpb", appName: "VPBank NEO", bankName: "VPBank" },
  { appId: "acb", appName: "ACB ONE", bankName: "ACB" },
  { appId: "icb", appName: "VietinBank iPay", bankName: "VietinBank" },
  { appId: "tpb", appName: "TPBank Mobile", bankName: "TPBank" },
  { appId: "vib-2", appName: "MyVIB 2.0", bankName: "VIB" },
  { appId: "vba", appName: "Agribank E-Mobile Banking", bankName: "Agribank" }
];

function addBankAppToDeepLink(deepLink: string, appId: string) {
  const url = new URL(deepLink);
  url.searchParams.set("app", appId);
  return url.toString();
}

type Invoice = {
  id: string;
  month: number;
  year: number;
  amount: number;
  memoContent: string;
  status: "paid" | "unpaid";
  qrImageUrl: string;
  deepLink: string;
};

type Student = {
  id: string;
  fullName: string;
  invoices: Invoice[];
};

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

export function PaymentFlow({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, "paid" | "unpaid">>({});
  const [bankApps, setBankApps] = useState<BankApp[]>(FALLBACK_BANK_APPS);
  const [bankAppId, setBankAppId] = useState("");
  const selected = useMemo(
    () => students.find((student) => student.id === studentId) ?? null,
    [studentId, students]
  );

  useEffect(() => {
    const platform = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "ios" : "android";
    const controller = new AbortController();

    void fetch(`https://api.vietqr.io/v2/${platform}-app-deeplinks`, {
      signal: controller.signal
    })
      .then((response) => {
        if (!response.ok) throw new Error("Không tải được danh sách app ngân hàng");
        return response.json() as Promise<{ apps?: BankApp[] }>;
      })
      .then((data) => {
        const apps = data.apps?.filter(
          (app) => app.appId && app.appName && /^[a-z0-9-]+$/i.test(app.appId)
        );
        if (apps?.length) setBankApps(apps);
      })
      .catch(() => {
        // Giữ danh sách phổ biến dự phòng khi API VietQR tạm thời không khả dụng.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!confirmed) return;
    if (!selected) return;
    const ids = selected.invoices.map((invoice) => invoice.id);
    if (ids.length === 0) return;

    const poll = async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/pay/invoices/${id}`, { cache: "no-store" });
          if (!response.ok) return [id, "unpaid"] as const;
          const data = (await response.json()) as { status: "paid" | "unpaid" };
          return [id, data.status] as const;
        })
      );
      setStatuses((current) => ({ ...current, ...Object.fromEntries(entries) }));
    };

    void poll();
    const timer = window.setInterval(poll, 4000);
    return () => window.clearInterval(timer);
  }, [confirmed, selected]);

  if (students.length === 0) {
    return (
      <div className="rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-soft">
        <p className="font-semibold">Lớp này chưa có học sinh.</p>
      </div>
    );
  }

  const visibleInvoices = selected ? selected.invoices.map((invoice) => ({
    ...invoice,
    status: statuses[invoice.id] ?? invoice.status
  })) : [];
  const unpaidInvoices = visibleInvoices.filter((invoice) => invoice.status === "unpaid");

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2.5">
          <StepBadge n={1} />
          <p className="text-base font-bold">Chọn tên học sinh</p>
        </div>
        <select
          value={studentId}
          onChange={(event) => {
            setStudentId(event.target.value);
            setConfirmed(false);
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

      {!confirmed ? (
        <section className="flex items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-sm text-stone-600">
          <QrCode className="h-5 w-5 shrink-0 text-stone-400" />
          Chọn đúng tên học sinh rồi bấm <strong className="font-semibold text-neutralText">Tiếp theo</strong> để xem học phí và mã QR.
        </section>
      ) : unpaidInvoices.length === 0 ? (
        <section className="rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-soft">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-emerald-50 text-success">
            <CheckCircle2 className="h-9 w-9" />
          </span>
          <h2 className="mt-4 text-xl font-bold">Đã đóng đầy đủ học phí</h2>
          <p className="mt-2 text-stone-600">Hệ thống không còn hóa đơn chưa thanh toán cho học sinh này.</p>
          <Link href="/" className="mt-6 inline-block">
            <Button type="button" variant="secondary">
              <Home className="h-4 w-4" />
              Về trang chủ
            </Button>
          </Link>
        </section>
      ) : (
        unpaidInvoices.map((invoice) => (
          <section key={invoice.id} className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
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
                  Khi quét mã QR, số tiền và nội dung chuyển khoản sẽ <strong>tự động điền</strong>.
                  Nút bên dưới sẽ mở app đã chọn; khả năng tự động điền khi mở app tùy từng ngân hàng.
                </p>
              </div>
            </div>

            <div className="grid gap-3 p-5">
              <label className="grid gap-1.5 text-sm font-semibold text-stone-700">
                Chọn app ngân hàng trên điện thoại
                <select
                  value={bankAppId}
                  onChange={(event) => setBankAppId(event.target.value)}
                  className="focus-ring h-12 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-base font-normal shadow-sm transition-colors hover:border-stone-400 focus:border-primary"
                >
                  <option value="">Chọn ngân hàng của bạn</option>
                  {bankApps.map((app) => (
                    <option key={app.appId} value={app.appId}>
                      {app.appName.replace(/^[\u200e\u200f\u202a-\u202e]+/, "")}
                    </option>
                  ))}
                </select>
              </label>
              <a
                href={bankAppId ? addBankAppToDeepLink(invoice.deepLink, bankAppId) : undefined}
                aria-disabled={!bankAppId}
                onClick={(event) => {
                  if (!bankAppId) event.preventDefault();
                }}
                className={`focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-bold text-white shadow-sm ring-1 ring-inset ring-white/20 transition-all ${
                  bankAppId
                    ? "bg-gradient-to-b from-amber-400 to-accent hover:from-amber-500 hover:to-amber-600 hover:shadow-md active:scale-[0.98]"
                    : "cursor-not-allowed bg-stone-300"
                }`}
              >
                <ExternalLink className="h-5 w-5" />
                Mở app ngân hàng
              </a>
              <div className="flex items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang chờ xác nhận thanh toán...
              </div>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
