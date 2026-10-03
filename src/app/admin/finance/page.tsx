import Link from "next/link";
import {
  Banknote,
  Coins,
  LineChart,
  PiggyBank,
  Receipt,
  TrendingDown,
  TrendingUp,
  Users
} from "lucide-react";
import { deleteExpenseAction } from "@/lib/actions/finance";
import { AddExpenseForm } from "@/components/FinanceForms";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { SalaryPendingAlert } from "@/components/SalaryPendingAlert";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { getFinanceTrend, getMonthlyFinance } from "@/lib/finance";
import { formatCurrency, formatDayMonth, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getPendingSalaryLines, groupSalaryByTeacher } from "@/lib/salary";
import { expenseCategoryLabel } from "@/lib/schedule";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

export default async function FinancePage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const now = new Date();
  const parsedMonth = Number(params.month);
  const parsedYear = Number(params.year);
  const month =
    Number.isInteger(parsedMonth) && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : now.getMonth() + 1;
  const year =
    Number.isInteger(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100 ? parsedYear : now.getFullYear();

  const [finance, trend, pendingSalary, expenses, classes] = await Promise.all([
    getMonthlyFinance(month, year),
    getFinanceTrend(month, year),
    getPendingSalaryLines(now),
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
        paidAt: true,
        paymentMethod: true,
        createdAt: true,
        classRoom: { select: { name: true, shortCode: true } }
      }
    }),
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    })
  ]);

  const teacherGroups = groupSalaryByTeacher(finance.salaryLines);
  const unsettled = finance.teacherCost - finance.teacherSettled;
  const owedPast = pendingSalary.filter((line) => line.difference > 0);
  const profitTone = finance.profit > 0 ? "success" : finance.profit < 0 ? "warning" : "neutral";

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Thu chi"
        description="Doanh thu tính theo kỳ học phí (tiền tháng nào nằm ở tháng đó dù nộp muộn). Lương giáo viên tính theo ngày chốt lương: HS nộp sau ngày chốt được tính vào lương tháng sau."
        actions={<MonthSwitcher basePath="/admin/finance" month={month} year={year} />}
      />

      <SalaryPendingAlert
        count={owedPast.length}
        amount={owedPast.reduce((sum, line) => sum + line.difference, 0)}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Học phí kỳ ${formatMonth(month, year)} đã thu`}
          tone="success"
          value={formatCurrency(finance.collected)}
          hint={
            finance.collectedShortfall !== 0
              ? `Còn ${formatCurrency(finance.outstanding)} chưa thu · lệch ${formatCurrency(finance.collectedShortfall)} do gán lệch tiền`
              : `Còn ${formatCurrency(finance.outstanding)} chưa thu`
          }
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          label="Lương giáo viên phải trả"
          tone="primary"
          value={formatCurrency(finance.teacherCost)}
          hint={
            unsettled !== 0
              ? `Đã chuyển ${formatCurrency(finance.teacherSettled)} · còn ${formatCurrency(unsettled)}`
              : `Đã chuyển đủ ${formatCurrency(finance.teacherSettled)}`
          }
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          label="Chi phí khác"
          tone="neutral"
          value={formatCurrency(finance.otherCost)}
          hint={`Tổng chi ${formatCurrency(finance.totalCost)}`}
          icon={<Receipt className="h-5 w-5" />}
        />
        <StatCard
          label={finance.profit >= 0 ? "Lợi nhuận kỳ" : "Lỗ kỳ"}
          tone={profitTone}
          value={formatCurrency(finance.profit)}
          hint={
            finance.collected > 0
              ? `Biên lợi nhuận ${Math.round(finance.marginRate * 100)}%`
              : "Chưa có doanh thu trong kỳ"
          }
          icon={finance.profit >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
        />
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 p-5">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Lương giáo viên kỳ {formatMonth(month, year)}</h2>
          </div>
          <p className="text-xs text-stone-500">
            Lương = % của lớp × học phí nộp đến ngày chốt (gồm nộp muộn tháng trước). Ghi các lần chuyển tiền ở{" "}
            <Link href="/admin/salary" className="font-semibold text-primary hover:underline">
              Lương GV
            </Link>
            .
          </p>
        </div>
        {teacherGroups.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có lớp nào tính lương">
              Khai % lương giáo viên ở Lớp học → Sửa lớp để hệ thống tự tính lương theo học phí đã thu.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Giáo viên / Lớp</th>
                  <th className="px-4 py-3 text-right">Học phí tính lương</th>
                  <th className="px-4 py-3 text-right">Phải trả</th>
                  <th className="px-4 py-3 text-right">Đã chuyển</th>
                  <th className="px-4 py-3 text-right">Còn nợ GV</th>
                  <th className="px-4 py-3">Tình trạng</th>
                </tr>
              </thead>
              {teacherGroups.map((group) => {
                const open = group.lines.some((line) => line.mode === "percent" && line.difference !== 0);
                return (
                  <tbody
                    key={group.teacherName || "__none"}
                    className="divide-y divide-stone-100 border-t-2 border-stone-200"
                  >
                    <tr className="bg-indigo-50/50">
                      <td className="px-4 py-3 font-bold text-neutralText">
                        {group.teacherName || "Chưa ghi tên giáo viên"}
                        <span className="ml-2 text-xs font-medium text-stone-500">{group.lines.length} lớp</span>
                      </td>
                      <td className="px-4 py-3" />
                      <td className="whitespace-nowrap px-4 py-3 text-right font-bold">{formatCurrency(group.due)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-stone-600">
                        {formatCurrency(group.paidOut)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                          group.difference === 0
                            ? "text-stone-400"
                            : group.difference > 0
                              ? "text-warning"
                              : "text-primary"
                        }`}
                      >
                        {group.difference === 0 ? "—" : formatCurrency(group.difference)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/salary?teacher=${encodeURIComponent(group.teacherName || "__none")}`}
                          className={`focus-ring inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-semibold ${
                            open
                              ? "bg-accent text-white shadow-sm hover:bg-amber-600"
                              : "text-primary hover:bg-indigo-50"
                          }`}
                        >
                          {open ? "Ghi chuyển lương" : "Xem sổ lương"}
                        </Link>
                      </td>
                    </tr>
                    {group.lines.map((line) => {
                      const status = line.status;
                      return (
                        <tr key={line.classId} className="transition-colors hover:bg-stone-50">
                          <td className="px-4 py-2.5 pl-8">
                            <div className="font-medium">{line.className}</div>
                            <div className="text-xs text-stone-500">
                              {line.shortCode}
                              {line.mode === "percent" ? ` · ${line.sharePercent}%` : ""} · chốt{" "}
                              {formatDayMonth(line.cutoffDate)}
                              {line.archived ? " · đã lưu trữ" : ""}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-success">
                            {formatCurrency(line.collected)}
                            {line.carriedIn.length > 0 ? (
                              <div className="text-[11px] font-medium text-emerald-700">
                                gồm {line.carriedIn.length} HS nộp muộn tháng trước
                              </div>
                            ) : null}
                            {line.carriedOut.length > 0 ? (
                              <div className="text-[11px] font-medium text-amber-700">
                                {line.carriedOut.length} HS nộp sau chốt → tháng sau
                              </div>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCurrency(line.due)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 text-right text-stone-600">
                            {formatCurrency(line.paidOut)}
                          </td>
                          <td
                            className={`whitespace-nowrap px-4 py-2.5 text-right font-semibold ${
                              line.difference === 0
                                ? "text-stone-400"
                                : line.difference > 0
                                  ? "text-warning"
                                  : "text-primary"
                            }`}
                          >
                            {line.difference === 0 ? "—" : formatCurrency(line.difference)}
                          </td>
                          <td className="px-4 py-2.5">
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-stone-200 p-5">
            <PiggyBank className="h-5 w-5 text-primary" />
            <h2 className="font-bold">Lãi/lỗ từng lớp kỳ {formatMonth(month, year)}</h2>
          </div>
          {finance.classMargins.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Chưa có dữ liệu trong tháng">
                Tạo hóa đơn hoặc ghi chi phí để thấy hiệu quả từng lớp.
              </EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
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
                      </td>
                      <td className="px-4 py-3 text-stone-600">{row.sessions === null ? "-" : row.sessions}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-success">
                        {formatCurrency(row.collected)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-warning">
                        {formatCurrency(row.outstanding)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-stone-600">
                        {formatCurrency(row.teacherCost)}
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
            <h2 className="font-bold">Cơ cấu chi phí kỳ</h2>
            {finance.costsByCategory.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">Chưa có chi phí nào trong kỳ.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {finance.costsByCategory.map((item) => {
                  const percent = finance.totalCost > 0 ? (item.amount / finance.totalCost) * 100 : 0;
                  return (
                    <div key={item.category}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-stone-600">{expenseCategoryLabel(item.category)}</span>
                        <span className="font-semibold">{formatCurrency(item.amount)}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-primary"
                          style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="font-bold">Dòng tiền về trong {formatMonth(month, year)}</h2>
            <p className="mt-1 text-xs text-stone-500">Theo ngày nhận tiền, để đối chiếu sao kê ngân hàng.</p>
            <dl className="mt-3 grid gap-1.5 text-sm">
              {(
                [
                  ["Tổng tiền về", finance.cashIn.total, "font-bold text-success"],
                  ["· Học phí kỳ này", finance.cashIn.currentPeriod, ""],
                  ["· Thu nợ kỳ trước", finance.cashIn.earlierPeriods, "text-warning"],
                  ["· Đóng trước kỳ sau", finance.cashIn.laterPeriods, ""],
                  // Tiền mặt chỉ còn ở dữ liệu cũ (nay nộp tiền mặt cũng chuyển qua QR).
                  ...(finance.cashIn.cash !== 0
                    ? ([
                        ["Chuyển khoản", finance.cashIn.bankTransfer, ""],
                        ["Tiền mặt (ghi tay cũ)", finance.cashIn.cash, ""]
                      ] as const)
                    : [])
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <dt className="text-stone-600">{label}</dt>
                  <dd className={`font-semibold ${tone}`}>{formatCurrency(value)}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <LineChart className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Xu hướng 6 kỳ gần nhất</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">Kỳ</th>
                <th className="px-4 py-3 text-right">Đã thu</th>
                <th className="px-4 py-3 text-right">Lương GV</th>
                <th className="px-4 py-3 text-right">Chi phí khác</th>
                <th className="px-4 py-3 text-right">Lợi nhuận</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {trend.map((point) => {
                const isCurrent = point.month === month && point.year === year;
                return (
                  <tr
                    key={`${point.year}-${point.month}`}
                    className={isCurrent ? "bg-indigo-50/50" : "hover:bg-stone-50"}
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/finance?month=${point.month}&year=${point.year}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {formatMonth(point.month, point.year)}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right text-success">
                      {formatCurrency(point.collected)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCurrency(point.teacherCost)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">{formatCurrency(point.otherCost)}</td>
                    <td
                      className={`whitespace-nowrap px-4 py-2.5 text-right font-bold ${
                        point.profit >= 0 ? "text-primary" : "text-warning"
                      }`}
                    >
                      {formatCurrency(point.profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="font-bold">Thêm chi phí {formatMonth(month, year)}</h2>
        <div className="mt-4">
          <AddExpenseForm month={month} year={year} classes={classes} />
        </div>
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-200 p-5">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Chi phí đã ghi nhận kỳ {formatMonth(month, year)}</h2>
        </div>
        {expenses.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có chi phí nào">Ghi lương ở trang Lương GV hoặc thêm chi phí thủ công.</EmptyState>
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
                      <div className="text-xs text-stone-500">
                        {expense.paidAt ? "Chuyển ngày" : "Ghi ngày"} {dateFormat.format(expense.paidAt ?? expense.createdAt)}
                        {expense.note ? ` · ${expense.note}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={expense.category === "teacher_salary" ? "primary" : "neutral"}>
                        {expenseCategoryLabel(expense.category)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{expense.classRoom?.shortCode ?? "Chung"}</td>
                    <td className="px-4 py-3 text-xs text-stone-500">
                      {expense.sharePercent !== null && expense.baseAmount !== null
                        ? `${expense.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản"} · ${expense.sharePercent}%`
                        : "Nhập tay"}
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                        expense.amount < 0 ? "text-primary" : ""
                      }`}
                    >
                      {formatCurrency(expense.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <ConfirmDeleteButton
                          id={expense.id}
                          action={deleteExpenseAction}
                          title="Xóa chi phí"
                          description={
                            <>
                              Xóa <strong>{expense.description}</strong> ({formatCurrency(expense.amount)})?
                              {expense.category === "teacher_salary" && expense.classRoom
                                ? " Số này sẽ quay lại phần còn nợ giáo viên."
                                : ""}
                            </>
                          }
                        />
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
