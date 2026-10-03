import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Users, Wallet } from "lucide-react";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { DebtReminderButton } from "@/components/DebtReminderButton";
import { Badge, EmptyState, Field, Panel, PageHeader, Select, StatCard } from "@/components/ui";
import {
  buildReminderMessage,
  buildZaloLink,
  DEBT_SORTS,
  debtPeriodKey,
  filterDebtRowsByPeriod,
  getOutstandingDebts,
  parseDebtPeriod,
  parseDebtSort,
  sortDebtRows,
  summarizeDebtPeriods,
  summarizeDebtRows
} from "@/lib/debts";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

function overdueTone(monthsOverdue: number) {
  if (monthsOverdue >= 2) return "warning" as const;
  if (monthsOverdue === 1) return "primary" as const;
  return "neutral" as const;
}

function overdueLabel(monthsOverdue: number) {
  if (monthsOverdue <= 0) return "Tháng này";
  return `Quá hạn ${monthsOverdue} tháng`;
}

export default async function DebtsPage({
  searchParams
}: {
  searchParams: Promise<{ classId?: string; sort?: string; period?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const classId = (params.classId || "").trim();
  const sort = parseDebtSort(params.sort);
  const period = parseDebtPeriod(params.period);
  const [settings, classes] = await Promise.all([
    getAppSettings(),
    prisma.classRoom.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } })
  ]);
  const debts = await getOutstandingDebts({
    classId: classId || undefined,
    appUrl: settings.appUrl
  });

  const periods = summarizeDebtPeriods(debts.rows);
  const periodKey = period ? debtPeriodKey(period.month, period.year) : "";
  // Tin nhắc nợ luôn dựng từ toàn bộ khoản nợ của học sinh, kể cả khi đang lọc một tháng.
  const fullRows = new Map(debts.rows.map((row) => [row.studentId, row]));
  const rows = sortDebtRows(period ? filterDebtRowsByPeriod(debts.rows, period) : debts.rows, sort);
  const summary = period ? summarizeDebtRows(rows) : debts;

  const filterHref = (nextPeriod: string) => {
    const search = new URLSearchParams();
    if (classId) search.set("classId", classId);
    if (sort !== "oldest") search.set("sort", sort);
    if (nextPeriod) search.set("period", nextPeriod);
    const query = search.toString();
    return query ? `/admin/debts?${query}` : "/admin/debts";
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Công nợ"
        description="Toàn bộ học phí chưa thu, cộng dồn qua mọi tháng. Lọc theo tháng hoặc đổi cách sắp xếp ở bên dưới."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={period ? `Công nợ ${formatMonth(period.month, period.year)}` : "Tổng công nợ"}
          tone={summary.totalAmount > 0 ? "warning" : "success"}
          value={formatCurrency(summary.totalAmount)}
          hint={`${summary.invoiceCount} hóa đơn chưa thu`}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Học sinh còn nợ"
          tone="neutral"
          value={summary.studentCount}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Nợ quá hạn"
          tone={summary.overdueAmount > 0 ? "warning" : "success"}
          value={formatCurrency(summary.overdueAmount)}
          hint={`${summary.overdueStudentCount} học sinh nợ từ tháng trước trở về trước`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Nợ trung bình / HS"
          tone="primary"
          value={formatCurrency(summary.studentCount > 0 ? Math.round(summary.totalAmount / summary.studentCount) : 0)}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <Panel className="grid gap-4">
        <AutoSubmitForm action="/admin/debts" className="grid items-end gap-3 sm:grid-cols-2 lg:max-w-2xl">
          {periodKey ? <input type="hidden" name="period" value={periodKey} /> : null}
          <Field label="Lớp">
            <Select name="classId" defaultValue={classId}>
              <option value="">Tất cả lớp</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sắp xếp">
            <Select name="sort" defaultValue={sort}>
              {DEBT_SORTS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </AutoSubmitForm>

        {periods.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-stone-400">Theo tháng học phí</p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={filterHref("")}
                className={`focus-ring inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                  !periodKey ? "bg-primary text-white ring-primary" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                }`}
              >
                Tất cả tháng
              </Link>
              {periods.map((item) => {
                const active = item.key === periodKey;
                return (
                  <Link
                    key={item.key}
                    href={filterHref(item.key)}
                    className={`focus-ring inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                      active ? "bg-primary text-white ring-primary" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                    }`}
                    title={`${item.studentCount} học sinh · ${item.invoiceCount} hóa đơn`}
                  >
                    T{item.month}/{item.year}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {item.studentCount} HS · {formatCurrency(item.amount)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ) : null}
      </Panel>

      {rows.length === 0 ? (
        <EmptyState title="Không còn công nợ" icon={<CheckCircle2 className="h-6 w-6" />}>
          {period
            ? `Không còn khoản nợ nào của ${formatMonth(period.month, period.year)}.`
            : classId
              ? "Lớp này đã thu đủ học phí ở mọi tháng."
              : "Toàn bộ hóa đơn đã được thanh toán, miễn hoặc hủy."}
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Phụ huynh / SĐT</th>
                  <th className="px-4 py-3">Các khoản chưa thu</th>
                  <th className="px-4 py-3">Tình trạng</th>
                  <th className="px-4 py-3 text-right">{period ? `Nợ T${period.month}` : "Tổng nợ"}</th>
                  <th className="px-4 py-3 text-right">Nhắc nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row) => {
                  const full = fullRows.get(row.studentId) ?? row;
                  const otherInvoices = full.invoices.filter(
                    (invoice) => !row.invoices.some((item) => item.id === invoice.id)
                  );
                  return (
                    <tr key={row.studentId} className="align-top transition-colors hover:bg-indigo-50/40">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/students/${row.studentId}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {row.studentName}
                        </Link>
                        {row.studentArchived ? (
                          <div className="mt-1">
                            <Badge tone="neutral">Đã lưu trữ</Badge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="grid gap-1">
                          {row.classes.map((classRoom) => (
                            <div key={classRoom.shortCode} className="leading-tight">
                              <div className="font-medium text-stone-700">{classRoom.name}</div>
                              <div className="text-xs text-stone-500">{classRoom.shortCode}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-stone-700">{row.parentName || "-"}</div>
                        <div className="font-mono text-xs text-stone-500">{row.phone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <ul className="grid gap-1">
                          {row.invoices.map((invoice) => (
                            <li key={invoice.id} className="flex flex-wrap items-center gap-x-2 text-stone-700">
                              <span className="font-medium">{formatMonth(invoice.month, invoice.year)}</span>
                              <span className="text-xs text-stone-500">{invoice.classShortCode}</span>
                              <span className="font-semibold text-warning">{formatCurrency(invoice.amount)}</span>
                            </li>
                          ))}
                        </ul>
                        {otherInvoices.length > 0 ? (
                          <p className="mt-1 text-xs text-stone-500">
                            Còn nợ thêm{" "}
                            {otherInvoices.map((invoice) => `T${invoice.month}/${invoice.year}`).join(", ")} ·{" "}
                            {formatCurrency(otherInvoices.reduce((sum, invoice) => sum + invoice.amount, 0))}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={overdueTone(row.oldestOverdue)} dot>
                          {overdueLabel(row.oldestOverdue)}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-base font-bold text-warning">
                        {formatCurrency(row.totalAmount)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <DebtReminderButton
                            studentName={row.studentName}
                            message={buildReminderMessage(full, settings.debtReminderTemplate)}
                            zaloUrl={buildZaloLink(row.phone)}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
