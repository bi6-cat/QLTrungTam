import {
  Banknote,
  Coins,
  PiggyBank,
  Receipt,
  Trash2,
  TrendingDown,
  TrendingUp
} from "lucide-react";
import { deleteExpenseAction } from "@/lib/actions";
import { AddExpenseForm, GenerateSalaryButton } from "@/components/FinanceForms";
import { Badge, Button, EmptyState, Field, Input, Panel, PageHeader, StatCard } from "@/components/ui";
import { getMonthlyFinance } from "@/lib/finance";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { expenseCategoryLabel } from "@/lib/schedule";

export const dynamic = "force-dynamic";

export default async function FinancePage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12
      ? parsedMonth
      : now.getMonth() + 1;
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100
      ? parsedYear
      : now.getFullYear();

  const [finance, expenses, classes] = await Promise.all([
    getMonthlyFinance(month, year),
    prisma.expense.findMany({
      where: { month, year },
      orderBy: [{ category: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        category: true,
        description: true,
        amount: true,
        sharePercent: true,
        baseAmount: true,
        note: true,
        classRoom: { select: { name: true, shortCode: true } }
      }
    }),
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    })
  ]);

  const profitTone = finance.profit > 0 ? "success" : finance.profit < 0 ? "warning" : "neutral";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Thu chi"
        description="Doanh thu ghi theo kỳ học phí, trừ lương giáo viên và chi phí vận hành để ra lãi/lỗ từng tháng."
      />

      <Panel>
        <form action="/admin/finance" method="GET" className="grid items-end gap-3 sm:grid-cols-[140px_160px_auto]">
          <Field label="Tháng">
            <Input name="month" type="number" min="1" max="12" defaultValue={month} />
          </Field>
          <Field label="Năm">
            <Input name="year" type="number" min="2020" defaultValue={year} />
          </Field>
          <Button type="submit" variant="secondary" className="sm:w-fit">
            Xem tháng
          </Button>
        </form>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Doanh thu ${formatMonth(month, year)}`}
          tone="success"
          value={formatCurrency(finance.collected)}
          hint={`Còn ${formatCurrency(finance.outstanding)} chưa thu`}
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          label="Lương giáo viên"
          tone="primary"
          value={formatCurrency(finance.teacherCost)}
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          label="Chi phí khác"
          tone="neutral"
          value={formatCurrency(finance.otherCost)}
          hint={`Tổng chi ${formatCurrency(finance.totalExpense)}`}
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label={finance.profit >= 0 ? "Lợi nhuận" : "Lỗ"}
          tone={profitTone}
          value={formatCurrency(finance.profit)}
          hint={
            finance.collected > 0
              ? `Biên lợi nhuận ${Math.round(finance.marginRate * 100)}%`
              : "Chưa có doanh thu trong tháng"
          }
          icon={
            finance.profit >= 0 ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-stone-200 p-5">
            <PiggyBank className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Hiệu quả từng lớp</h2>
          </div>
          {finance.classMargins.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Chưa có dữ liệu trong tháng">
                Tạo hóa đơn hoặc ghi chi phí để thấy hiệu quả từng lớp.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Lớp</th>
                    <th className="px-4 py-3">Buổi</th>
                    <th className="px-4 py-3 text-right">Đã thu</th>
                    <th className="px-4 py-3 text-right">Chưa thu</th>
                    <th className="px-4 py-3 text-right">Lương GV</th>
                    <th className="px-4 py-3 text-right">Chi phí khác</th>
                    <th className="px-4 py-3 text-right">Còn lại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {finance.classMargins.map((row) => (
                    <tr key={row.classId} className="transition-colors hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.name}</div>
                        <div className="text-xs text-stone-500">
                          {row.shortCode}
                          {row.teacherName ? ` · ${row.teacherName}` : ""}
                        </div>
                        {!row.hasSalaryRecord && row.teacherSharePercent > 0 ? (
                          <div className="mt-1">
                            <Badge tone="warning">Chưa tính lương</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-stone-600">
                        {row.sessions === null ? "-" : row.sessions}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-success">
                        {formatCurrency(row.collected)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-warning">
                        {formatCurrency(row.outstanding)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-stone-600">
                        {formatCurrency(row.teacherCost)}
                        {row.teacherSharePercent > 0 ? (
                          <div className="text-xs text-stone-400">{row.teacherSharePercent}% đã thu</div>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-stone-600">
                        {formatCurrency(row.otherCost)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                          row.margin >= 0 ? "text-primary" : "text-warning"
                        }`}
                      >
                        {formatCurrency(row.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="grid h-fit gap-5">
          <Panel>
            <h2 className="font-bold">Tính lương giáo viên</h2>
            <p className="mb-4 mt-1 text-sm text-stone-600">
              Lương = % chia của từng lớp × học phí <strong>đã thu</strong> trong tháng. Lớp đã có
              bản ghi lương sẽ bị bỏ qua; muốn tính lại thì xóa bản ghi cũ trước.
            </p>
            <GenerateSalaryButton month={month} year={year} />
          </Panel>

          <Panel>
            <h2 className="font-bold">Cơ cấu chi phí</h2>
            {finance.expensesByCategory.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">Chưa ghi nhận chi phí nào trong tháng.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {finance.expensesByCategory.map((item) => {
                  const percent =
                    finance.totalExpense > 0 ? (item.amount / finance.totalExpense) * 100 : 0;
                  return (
                    <div key={item.category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-stone-600">{expenseCategoryLabel(item.category)}</span>
                        <span className="font-semibold">{formatCurrency(item.amount)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-primary"
                          style={{ width: `${Math.max(2, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel>
        <h2 className="font-bold">Thêm chi phí {formatMonth(month, year)}</h2>
        <div className="mt-4">
          <AddExpenseForm month={month} year={year} classes={classes} />
        </div>
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Danh sách chi phí {formatMonth(month, year)}</h2>
        </div>
        {expenses.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có chi phí nào">
              Bấm &quot;Tính lương giáo viên&quot; hoặc thêm chi phí thủ công ở trên.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Nội dung</th>
                  <th className="px-4 py-3">Loại</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Cách tính</th>
                  <th className="px-4 py-3 text-right">Số tiền</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {expenses.map((expense) => (
                  <tr key={expense.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{expense.description}</div>
                      {expense.note ? (
                        <div className="text-xs text-stone-500">{expense.note}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={expense.category === "teacher_salary" ? "primary" : "neutral"}>
                        {expenseCategoryLabel(expense.category)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {expense.classRoom?.shortCode ?? "Chung"}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500">
                      {expense.sharePercent !== null && expense.baseAmount !== null
                        ? `${expense.sharePercent}% × ${formatCurrency(expense.baseAmount)} đã thu`
                        : "Nhập tay"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <form action={deleteExpenseAction}>
                          <input type="hidden" name="id" value={expense.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            className="h-8 w-8 px-0 text-stone-400 hover:bg-rose-50 hover:text-warning"
                            title="Xóa chi phí"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
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
