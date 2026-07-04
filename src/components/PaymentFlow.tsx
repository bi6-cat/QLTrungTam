"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDollarSign, ExternalLink, Loader2 } from "lucide-react";
import { markInvoicePaidForTestAction } from "@/lib/actions";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

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

export function PaymentFlow({ students }: { students: Student[] }) {
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, "paid" | "unpaid">>({});
  const selected = useMemo(
    () => students.find((student) => student.id === studentId) ?? students[0],
    [studentId, students]
  );

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

  if (!selected) {
    return (
      <div className="rounded-lg bg-white p-6 text-center shadow-soft">
        <p className="font-semibold">Lớp này chưa có học sinh.</p>
      </div>
    );
  }

  const visibleInvoices = selected.invoices.map((invoice) => ({
    ...invoice,
    status: statuses[invoice.id] ?? invoice.status
  }));
  const unpaidInvoices = visibleInvoices.filter((invoice) => invoice.status === "unpaid");

  return (
    <div className="grid gap-5">
      <section className="rounded-lg bg-white p-4 shadow-soft">
        <p className="text-sm font-semibold text-stone-500">Bước 1</p>
        <label className="mt-2 grid gap-2 text-base font-semibold">
          Chọn tên học sinh
          <select
            value={studentId}
            onChange={(event) => {
              setStudentId(event.target.value);
              setConfirmed(false);
            }}
            className="focus-ring h-12 rounded-md border border-stone-300 bg-white px-3 text-base"
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.fullName}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" className="mt-4 h-12 w-full text-base" onClick={() => setConfirmed(true)}>
          Tiếp theo
          <ArrowRight className="h-5 w-5" />
        </Button>
      </section>

      {!confirmed ? (
        <section className="rounded-lg border border-dashed border-stone-300 bg-white p-5 text-center text-stone-600">
          Chọn đúng tên học sinh rồi bấm Tiếp theo để xem học phí và mã QR.
        </section>
      ) : unpaidInvoices.length === 0 ? (
        <section className="rounded-lg bg-white p-6 text-center shadow-soft">
          <CheckCircle2 className="mx-auto h-12 w-12 text-success" />
          <h2 className="mt-3 text-xl font-bold">Đã đóng đầy đủ học phí</h2>
          <p className="mt-2 text-stone-600">Hệ thống không còn hóa đơn chưa thanh toán cho học sinh này.</p>
        </section>
      ) : (
        unpaidInvoices.map((invoice) => (
          <section key={invoice.id} className="rounded-lg bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-stone-500">Bước 2</p>
                <h2 className="mt-1 text-xl font-bold">{formatMonth(invoice.month, invoice.year)}</h2>
              </div>
              <Badge tone="warning">Chưa đóng</Badge>
            </div>

            <div className="mt-4 grid gap-3 rounded-md bg-stone-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-stone-600">Số tiền</span>
                <strong className="text-lg text-warning">{formatCurrency(invoice.amount)}</strong>
              </div>
              <div>
                <span className="text-stone-600">Nội dung chuyển khoản</span>
                <p className="mt-1 rounded-md bg-white px-3 py-2 font-mono text-sm font-semibold">
                  {invoice.memoContent}
                </p>
              </div>
            </div>

            <img
              src={invoice.qrImageUrl}
              alt={`Ma QR thanh toan ${invoice.memoContent}`}
              className="mx-auto mt-4 aspect-square w-full max-w-72 rounded-md border border-stone-200 object-contain"
            />

            <div className="mt-4 grid gap-3">
              <a
                href={invoice.deepLink}
                className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-md bg-accent px-4 text-base font-bold text-white"
              >
                <ExternalLink className="h-5 w-5" />
                Mở app ngân hàng
              </a>
              <div className="flex items-center justify-center gap-2 text-sm text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang chờ xác nhận thanh toán...
              </div>
              <form action={markInvoicePaidForTestAction}>
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Button type="submit" variant="secondary" className="w-full">
                  <CircleDollarSign className="h-4 w-4" />
                  Đánh dấu đã đóng (test)
                </Button>
              </form>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
