import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, History, Landmark } from "lucide-react";
import { TransactionMatchForm } from "@/components/TransactionMatchForm";
import { TransactionReviewActions } from "@/components/TransactionReviewActions";
import { Badge, Button, EmptyState, Field, Input, Panel, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const LIST_PAGE_SIZE = 12;

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{
    month?: string;
    year?: string;
    paidPage?: string;
    txPage?: string;
    unmatchedPage?: string;
  }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const selectedMonth = Math.min(12, Math.max(1, Number(params.month) || now.getMonth() + 1));
  const selectedYear = Number(params.year) || now.getFullYear();
  const paidPage = Math.max(1, Number(params.paidPage) || 1);
  const txPage = Math.max(1, Number(params.txPage) || 1);
  const unmatchedPage = Math.max(1, Number(params.unmatchedPage) || 1);
  const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
  const periodEnd = new Date(selectedYear, selectedMonth, 1);

  const [unmatchedTransactions, allTransactions, paidHistory, allInvoices, unpaidInvoices] = await Promise.all([
    prisma.transaction.findMany({
      where: { matchedInvoiceId: null, resolvedAt: null, reversedAt: null },
      orderBy: { transferredAt: "desc" }
    }),
    prisma.transaction.findMany({
      where: {
        transferredAt: {
          gte: periodStart,
          lt: periodEnd
        }
      },
      orderBy: { transferredAt: "desc" },
      take: 120,
      include: {
        matchedInvoice: {
          include: {
            enrollment: { include: { student: true, classRoom: true } }
          }
        }
      }
    }),
    prisma.monthlyInvoice.findMany({
      where: { status: "paid", month: selectedMonth, year: selectedYear },
      orderBy: [{ paidAt: "desc" }, { year: "desc" }, { month: "desc" }],
      include: {
        transaction: true,
        enrollment: { include: { student: true, classRoom: true } }
      }
    }),
    prisma.monthlyInvoice.findMany({
      include: {
        enrollment: { include: { classRoom: true } }
      }
    }),
    prisma.monthlyInvoice.findMany({
      where: { status: "unpaid" },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      include: {
        enrollment: { include: { student: true, classRoom: true } }
      }
    })
  ]);

  const monthlySummary = Object.values(
    allInvoices.reduce<
      Record<
        string,
        {
          key: string;
          month: number;
          year: number;
          expectedAmount: number;
          paidAmount: number;
          invoiceCount: number;
          paidCount: number;
          unpaidCount: number;
          waivedCount: number;
          voidCount: number;
        }
      >
    >((acc, invoice) => {
      const key = `${invoice.year}-${String(invoice.month).padStart(2, "0")}`;
      acc[key] ??= {
        key,
        month: invoice.month,
        year: invoice.year,
        expectedAmount: 0,
        paidAmount: 0,
        invoiceCount: 0,
        paidCount: 0,
        unpaidCount: 0,
        waivedCount: 0,
        voidCount: 0
      };
      acc[key].invoiceCount += 1;
      if (invoice.status === "paid") {
        acc[key].expectedAmount += invoice.amount;
        acc[key].paidAmount += invoice.amount;
        acc[key].paidCount += 1;
      } else if (invoice.status === "unpaid") {
        acc[key].expectedAmount += invoice.amount;
        acc[key].unpaidCount += 1;
      } else if (invoice.status === "waived") {
        acc[key].waivedCount += 1;
      } else {
        acc[key].voidCount += 1;
      }
      return acc;
    }, {})
  ).sort((a, b) => b.key.localeCompare(a.key));

  const totalPaid = paidHistory.reduce((sum, invoice) => sum + invoice.amount, 0);
  const bankTransactions = allTransactions.filter(
    (transaction) => transaction.paymentMethod === "bank_transfer" && !transaction.reversedAt
  );
  const totalBankTransactions = bankTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  // Phân trang phía server cho từng danh sách, giữ nguyên tháng/năm và trang của các list khác.
  function slicePage<T>(items: T[], page: number) {
    const totalPages = Math.max(1, Math.ceil(items.length / LIST_PAGE_SIZE));
    const current = Math.min(page, totalPages);
    const start = (current - 1) * LIST_PAGE_SIZE;
    return { rows: items.slice(start, start + LIST_PAGE_SIZE), totalPages, current, start, total: items.length };
  }
  const paid = slicePage(paidHistory, paidPage);
  const tx = slicePage(allTransactions, txPage);
  const unmatched = slicePage(unmatchedTransactions, unmatchedPage);

  function pagerHref(param: string, value: number) {
    const search = new URLSearchParams();
    search.set("month", String(selectedMonth));
    search.set("year", String(selectedYear));
    if (paidPage > 1) search.set("paidPage", String(paidPage));
    if (txPage > 1) search.set("txPage", String(txPage));
    if (unmatchedPage > 1) search.set("unmatchedPage", String(unmatchedPage));
    search.set(param, String(value));
    return `/admin/transactions?${search.toString()}`;
  }

  function ListPager({
    param,
    current,
    totalPages,
    start,
    shown,
    total
  }: {
    param: string;
    current: number;
    totalPages: number;
    start: number;
    shown: number;
    total: number;
  }) {
    if (totalPages <= 1) return null;
    const linkBase =
      "focus-ring inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold shadow-sm transition-colors";
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4">
        <p className="text-sm text-stone-600">
          Hiển thị {start + 1}-{start + shown} / {total}
        </p>
        <div className="flex items-center gap-2">
          <Link
            href={pagerHref(param, Math.max(1, current - 1))}
            scroll={false}
            className={`${linkBase} ${current <= 1 ? "pointer-events-none opacity-50" : "hover:bg-stone-50"}`}
          >
            <ChevronLeft className="h-4 w-4" />
            Trước
          </Link>
          <span className="text-sm font-semibold text-stone-600">
            {current}/{totalPages}
          </span>
          <Link
            href={pagerHref(param, Math.min(totalPages, current + 1))}
            scroll={false}
            className={`${linkBase} ${current >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-stone-50"}`}
          >
            Sau
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Giao dịch"
        description="Theo dõi lịch sử chuyển khoản, lịch sử đóng tiền theo tháng và xử lý giao dịch chưa khớp."
      />

      <Panel>
        <form action="/admin/transactions" method="GET" className="grid items-end gap-3 sm:grid-cols-[140px_160px_auto]">
          <Field label="Lọc tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={selectedMonth} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={selectedYear} />
          </Field>
          <Button type="submit" variant="secondary" className="sm:w-fit">
            Xem lịch sử
          </Button>
        </form>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label={`Đã ghi nhận ${formatMonth(selectedMonth, selectedYear)}`}
          tone="success"
          value={formatCurrency(totalPaid)}
          hint={`${paidHistory.length} hóa đơn đã đóng`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatCard
          label={`Chuyển khoản ${formatMonth(selectedMonth, selectedYear)}`}
          tone="primary"
          value={formatCurrency(totalBankTransactions)}
          hint={`${bankTransactions.length} giao dịch ngân hàng hợp lệ`}
          icon={<Landmark className="h-5 w-5" />}
        />
        <StatCard
          label="Chưa khớp"
          tone="warning"
          value={unmatchedTransactions.length}
          hint="Cần đối soát thủ công"
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Tổng hợp theo tháng</h2>
        </div>
        {monthlySummary.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có hóa đơn">Tạo hóa đơn theo lớp để bắt đầu có lịch sử theo tháng.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Tháng</th>
                  <th className="px-4 py-3">Hóa đơn</th>
                  <th className="px-4 py-3">Đã đóng</th>
                  <th className="px-4 py-3">Chưa đóng</th>
                  <th className="px-4 py-3">Miễn / Hủy</th>
                  <th className="px-4 py-3">Đã thu</th>
                  <th className="px-4 py-3">Đã phát hành thu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                {monthlySummary.map((item) => (
                  <tr key={item.key}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatMonth(item.month, item.year)}</td>
                    <td className="px-4 py-3">{item.invoiceCount}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{item.paidCount}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={item.unpaidCount > 0 ? "warning" : "neutral"}>
                        {item.unpaidCount}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{item.waivedCount} / {item.voidCount}</td>
                    <td className="px-4 py-3 font-semibold">{formatCurrency(item.paidAmount)}</td>
                    <td className="px-4 py-3">{formatCurrency(item.expectedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch sử đóng tiền {formatMonth(selectedMonth, selectedYear)}</h2>
        </div>
        {paidHistory.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có học phí đã đóng">Khi webhook hoặc nút test xác nhận thanh toán, lịch sử sẽ xuất hiện tại đây.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Ngày đóng</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Tháng học phí</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Mã giao dịch</th>
                  <th className="px-4 py-3">Memo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                {paid.rows.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      {invoice.paidAt ? invoice.paidAt.toLocaleString("vi-VN") : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{invoice.enrollment.student.fullName}</div>
                      <div className="text-xs text-stone-500">{invoice.enrollment.student.phone}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{invoice.enrollment.classRoom.name}</td>
                    <td className="whitespace-nowrap px-4 py-3">{invoice.enrollment.classRoom.teacherName || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatMonth(invoice.month, invoice.year)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(invoice.amount)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      {invoice.transaction?.gatewayRef ?? "Thanh toán test/thủ công"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{invoice.memoContent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          param="paidPage"
          current={paid.current}
          totalPages={paid.totalPages}
          start={paid.start}
          shown={paid.rows.length}
          total={paid.total}
        />
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch sử giao dịch {formatMonth(selectedMonth, selectedYear)}</h2>
        </div>
        {allTransactions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có giao dịch">Giao dịch chuyển khoản hoặc tiền mặt sẽ xuất hiện tại đây.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Mã GD</th>
                  <th className="px-4 py-3">Phương thức</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Hóa đơn khớp</th>
                  <th className="px-4 py-3">Nội dung</th>
                  <th className="px-4 py-3">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                {tx.rows.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-4 py-3">{transaction.transferredAt.toLocaleString("vi-VN")}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{transaction.gatewayRef}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone="neutral">
                        {transaction.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          transaction.reversedAt
                            ? "warning"
                            : transaction.matchedInvoice
                              ? "success"
                              : transaction.resolvedAt
                                ? "neutral"
                                : "warning"
                        }
                      >
                        {transaction.reversedAt
                          ? "Đã hoàn tác"
                          : transaction.matchedInvoice
                            ? "Đã khớp"
                            : transaction.resolvedAt
                              ? "Đã xử lý"
                              : "Chưa khớp"}
                      </Badge>
                      {transaction.reversalReason ? (
                        <p className="mt-1 max-w-xs text-xs text-stone-500">{transaction.reversalReason}</p>
                      ) : null}
                      {transaction.matchedInvoice && transaction.matchOverrideReason ? (
                        <p className="mt-1 max-w-xs text-xs font-medium text-amber-700">
                          Gán lệch {formatCurrency(Math.abs(transaction.amount - transaction.matchedInvoice.amount))}: {transaction.matchOverrideReason}
                        </p>
                      ) : null}
                      {!transaction.reversedAt && transaction.resolvedNote ? (
                        <p className="mt-1 max-w-xs text-xs text-stone-500">{transaction.resolvedNote}</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {transaction.matchedInvoice ? (
                        <>
                          {transaction.matchedInvoice.enrollment.classRoom.shortCode} ·{" "}
                          {transaction.matchedInvoice.enrollment.student.fullName} ·{" "}
                          {formatMonth(transaction.matchedInvoice.month, transaction.matchedInvoice.year)}
                        </>
                      ) : transaction.reversedAt ? (
                        "Liên kết đã được hoàn tác"
                      ) : transaction.resolvedAt ? (
                        "Đã xử lý thủ công (không gán học sinh)"
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-lg break-words font-mono text-xs">{transaction.rawContent}</p>
                    </td>
                    <td className="px-4 py-3">
                      {transaction.matchedInvoice && !transaction.reversedAt ? (
                        <TransactionReviewActions transactionId={transaction.id} />
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          param="txPage"
          current={tx.current}
          totalPages={tx.totalPages}
          start={tx.start}
          shown={tx.rows.length}
          total={tx.total}
        />
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <AlertTriangle className="h-5 w-5 text-warning" />
          <h2 className="font-bold">Giao dịch chưa khớp cần xử lý</h2>
        </div>
        {unmatchedTransactions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Không có giao dịch chưa khớp">
              Các webhook hiện đều đã được xử lý hoặc chưa có giao dịch mới.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Mã GD</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Nội dung</th>
                  <th className="px-4 py-3">Gán thủ công</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                {unmatched.rows.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-4 py-3">{transaction.transferredAt.toLocaleString("vi-VN")}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{transaction.gatewayRef}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone="warning">Chưa khớp</Badge>
                      {transaction.matchReason ? (
                        <p className="mt-2 max-w-sm text-xs font-medium text-amber-700">{transaction.matchReason}</p>
                      ) : null}
                      <p className="mt-2 max-w-sm break-words font-mono text-xs">{transaction.rawContent}</p>
                    </td>
                    <td className="px-4 py-3">
                      <TransactionMatchForm
                        transactionId={transaction.id}
                        transactionAmount={transaction.amount}
                        invoices={unpaidInvoices.map((invoice) => ({
                          id: invoice.id,
                          amount: invoice.amount,
                          label: `${invoice.enrollment.classRoom.shortCode} · ${invoice.enrollment.student.fullName} · ${formatMonth(invoice.month, invoice.year)} · ${formatCurrency(invoice.amount)}`
                        }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ListPager
          param="unmatchedPage"
          current={unmatched.current}
          totalPages={unmatched.totalPages}
          start={unmatched.start}
          shown={unmatched.rows.length}
          total={unmatched.total}
        />
      </Panel>
    </div>
  );
}
