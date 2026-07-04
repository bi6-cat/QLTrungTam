import { AlertTriangle, CalendarDays, CheckCircle2, History, Landmark, LinkIcon } from "lucide-react";
import { assignTransactionAction } from "@/lib/actions";
import { Badge, Button, EmptyState, Field, Input, Panel, Select } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const selectedMonth = Math.min(12, Math.max(1, Number(params.month) || now.getMonth() + 1));
  const selectedYear = Number(params.year) || now.getFullYear();
  const periodStart = new Date(selectedYear, selectedMonth - 1, 1);
  const periodEnd = new Date(selectedYear, selectedMonth, 1);

  const [unmatchedTransactions, allTransactions, paidHistory, allInvoices, unpaidInvoices] = await Promise.all([
    prisma.transaction.findMany({
      where: { matchedInvoiceId: null },
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
        paidCount: 0
      };
      acc[key].expectedAmount += invoice.amount;
      acc[key].invoiceCount += 1;
      if (invoice.status === "paid") {
        acc[key].paidAmount += invoice.amount;
        acc[key].paidCount += 1;
      }
      return acc;
    }, {})
  ).sort((a, b) => b.key.localeCompare(a.key));

  const totalPaid = paidHistory.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalBankTransactions = allTransactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-bold text-neutralText">Giao dịch</h1>
        <p className="mt-1 text-sm text-stone-600">
          Theo dõi lịch sử chuyển khoản, lịch sử đóng tiền theo tháng và xử lý giao dịch chưa khớp.
        </p>
      </div>

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
        <Panel className="border-l-4 border-l-success">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Đã ghi nhận {formatMonth(selectedMonth, selectedYear)}</p>
            <CheckCircle2 className="h-5 w-5 text-success" />
          </div>
          <p className="mt-3 text-2xl font-bold">{formatCurrency(totalPaid)}</p>
          <p className="mt-1 text-sm text-stone-500">{paidHistory.length} hóa đơn đã đóng</p>
        </Panel>
        <Panel className="border-l-4 border-l-primary">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Giao dịch {formatMonth(selectedMonth, selectedYear)}</p>
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-3 text-2xl font-bold">{formatCurrency(totalBankTransactions)}</p>
          <p className="mt-1 text-sm text-stone-500">{allTransactions.length} giao dịch trong tháng</p>
        </Panel>
        <Panel className="border-l-4 border-l-warning">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-stone-500">Chưa khớp</p>
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <p className="mt-3 text-2xl font-bold">{unmatchedTransactions.length}</p>
          <p className="mt-1 text-sm text-stone-500">Cần đối soát thủ công</p>
        </Panel>
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
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Tháng</th>
                  <th className="px-4 py-3">Hóa đơn</th>
                  <th className="px-4 py-3">Đã đóng</th>
                  <th className="px-4 py-3">Chưa đóng</th>
                  <th className="px-4 py-3">Đã thu</th>
                  <th className="px-4 py-3">Dự kiến</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {monthlySummary.map((item) => (
                  <tr key={item.key}>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatMonth(item.month, item.year)}</td>
                    <td className="px-4 py-3">{item.invoiceCount}</td>
                    <td className="px-4 py-3">
                      <Badge tone="success">{item.paidCount}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={item.invoiceCount - item.paidCount > 0 ? "warning" : "neutral"}>
                        {item.invoiceCount - item.paidCount}
                      </Badge>
                    </td>
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
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
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
              <tbody className="divide-y divide-stone-100">
                {paidHistory.map((invoice) => (
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
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <Landmark className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch sử giao dịch {formatMonth(selectedMonth, selectedYear)}</h2>
        </div>
        {allTransactions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có giao dịch ngân hàng">Webhook SePay sẽ ghi log giao dịch tại đây.</EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Mã GD</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Hóa đơn khớp</th>
                  <th className="px-4 py-3">Nội dung</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {allTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-4 py-3">{transaction.transferredAt.toLocaleString("vi-VN")}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{transaction.gatewayRef}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={transaction.matchedInvoice ? "success" : "warning"}>
                        {transaction.matchedInvoice ? "Đã khớp" : "Chưa khớp"}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {transaction.matchedInvoice ? (
                        <>
                          {transaction.matchedInvoice.enrollment.classRoom.shortCode} ·{" "}
                          {transaction.matchedInvoice.enrollment.student.fullName} ·{" "}
                          {formatMonth(transaction.matchedInvoice.month, transaction.matchedInvoice.year)}
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="max-w-lg break-words font-mono text-xs">{transaction.rawContent}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Mã GD</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Nội dung</th>
                  <th className="px-4 py-3">Gán thủ công</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {unmatchedTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="whitespace-nowrap px-4 py-3">{transaction.transferredAt.toLocaleString("vi-VN")}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{transaction.gatewayRef}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(transaction.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone="warning">Chưa khớp</Badge>
                      <p className="mt-2 max-w-sm break-words font-mono text-xs">{transaction.rawContent}</p>
                    </td>
                    <td className="px-4 py-3">
                      <form action={assignTransactionAction} className="grid gap-2">
                        <input type="hidden" name="transactionId" value={transaction.id} />
                        <Field label="Hóa đơn chưa đóng">
                          <Select name="invoiceId" required>
                            {unpaidInvoices.map((invoice) => (
                              <option key={invoice.id} value={invoice.id}>
                                {invoice.enrollment.classRoom.shortCode} · {invoice.enrollment.student.fullName} ·{" "}
                                {formatMonth(invoice.month, invoice.year)} · {formatCurrency(invoice.amount)}
                              </option>
                            ))}
                          </Select>
                        </Field>
                        <Button type="submit" disabled={unpaidInvoices.length === 0}>
                          <LinkIcon className="h-4 w-4" />
                          Gán và đánh dấu đã đóng
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
