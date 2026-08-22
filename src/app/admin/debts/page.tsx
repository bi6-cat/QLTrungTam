import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, Users, Wallet } from "lucide-react";
import { DebtReminderButton } from "@/components/DebtReminderButton";
import { Badge, Button, EmptyState, Field, Panel, PageHeader, Select, StatCard } from "@/components/ui";
import { buildReminderMessage, buildZaloLink, getOutstandingDebts } from "@/lib/debts";
import { formatCurrency, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

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
  searchParams: Promise<{ classId?: string }>;
}) {
  const params = await searchParams;
  const classId = (params.classId || "").trim();
  const [settings, classes] = await Promise.all([
    getAppSettings(),
    prisma.classRoom.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } })
  ]);
  const debts = await getOutstandingDebts({
    classId: classId || undefined,
    appUrl: settings.appUrl
  });

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Công nợ"
        description="Toàn bộ học phí chưa thu, cộng dồn qua mọi tháng. Nợ lâu nhất xếp lên đầu."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tổng công nợ"
          tone={debts.totalAmount > 0 ? "warning" : "success"}
          value={formatCurrency(debts.totalAmount)}
          hint={`${debts.invoiceCount} hóa đơn chưa thu`}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Học sinh còn nợ"
          tone="neutral"
          value={debts.studentCount}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Nợ quá hạn"
          tone={debts.overdueAmount > 0 ? "warning" : "success"}
          value={formatCurrency(debts.overdueAmount)}
          hint={`${debts.overdueStudentCount} học sinh nợ từ tháng trước trở về trước`}
          icon={<Clock className="h-5 w-5" />}
        />
        <StatCard
          label="Nợ trung bình / HS"
          tone="primary"
          value={formatCurrency(
            debts.studentCount > 0 ? Math.round(debts.totalAmount / debts.studentCount) : 0
          )}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <Panel>
        <form action="/admin/debts" method="GET" className="grid items-end gap-3 sm:grid-cols-[minmax(0,320px)_auto]">
          <Field label="Lọc theo lớp">
            <Select name="classId" defaultValue={classId}>
              <option value="">Tất cả lớp</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" className="sm:w-fit">
            Xem công nợ
          </Button>
        </form>
      </Panel>

      {debts.rows.length === 0 ? (
        <EmptyState title="Không còn công nợ" icon={<CheckCircle2 className="h-6 w-6" />}>
          {classId
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
                  <th className="px-4 py-3 text-right">Tổng nợ</th>
                  <th className="px-4 py-3 text-right">Nhắc nợ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {debts.rows.map((row) => (
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
                          message={buildReminderMessage(row)}
                          zaloUrl={buildZaloLink(row.phone)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
