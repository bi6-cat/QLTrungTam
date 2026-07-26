import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  FilePlus2,
  ReceiptText,
  Users,
  Wallet
} from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, Panel, PageHeader, StatCard } from "@/components/ui";
import { getDashboard } from "@/lib/dashboard";
import { formatCurrency, formatMonth } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Chiều cao vùng vẽ cột của biểu đồ xu hướng, tính bằng pixel. */
const CHART_HEIGHT = 176;

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default async function AdminHomePage({
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

  const dashboard = await getDashboard(month, year);
  const { totals, alerts, outstandingAllTime, trend } = dashboard;
  const trendMax = Math.max(1, ...trend.map((point) => point.collected + point.outstanding));

  const actionItems = [
    totals.unissued > 0
      ? {
          key: "unissued",
          tone: "warning" as const,
          icon: <FilePlus2 className="h-4 w-4" />,
          text: `${totals.unissued} học sinh đang học chưa có hóa đơn ${formatMonth(month, year)}.`,
          href: "/admin/classes",
          cta: "Tạo hóa đơn"
        }
      : null,
    alerts.unmatchedTransactions > 0
      ? {
          key: "unmatched",
          tone: "warning" as const,
          icon: <AlertTriangle className="h-4 w-4" />,
          text: `${alerts.unmatchedTransactions} giao dịch chưa khớp cần đối soát.`,
          href: "/admin/transactions",
          cta: "Đối soát"
        }
      : null,
    outstandingAllTime.olderThanThisMonth > 0
      ? {
          key: "overdue",
          tone: "warning" as const,
          icon: <ReceiptText className="h-4 w-4" />,
          text: `${outstandingAllTime.olderThanThisMonth} hóa đơn quá hạn từ các tháng trước.`,
          href: "/admin/debts",
          cta: "Nhắc nợ"
        }
      : null,
    alerts.classesWithoutSchedule > 0
      ? {
          key: "schedule",
          tone: "neutral" as const,
          icon: <CalendarClock className="h-4 w-4" />,
          text: `${alerts.classesWithoutSchedule} lớp chưa xếp thời khóa biểu.`,
          href: "/admin/schedule",
          cta: "Xếp lịch"
        }
      : null,
    alerts.salaryNotGenerated
      ? {
          key: "salary",
          tone: "neutral" as const,
          icon: <Wallet className="h-4 w-4" />,
          text: `Chưa tính lương giáo viên cho ${formatMonth(month, year)}.`,
          href: `/admin/finance?month=${month}&year=${year}`,
          cta: "Tính lương"
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Tổng quan ${formatMonth(month, year)}`}
        description={
          dashboard.isCurrentPeriod
            ? "Theo dõi thu học phí theo từng lớp trong tháng hiện tại."
            : "Đang xem số liệu của một tháng trong quá khứ hoặc tương lai."
        }
        actions={
          <form action="/admin" method="GET" className="flex flex-wrap items-end gap-2">
            <Field label="Tháng">
              <Input name="month" type="number" min="1" max="12" defaultValue={month} className="w-24" />
            </Field>
            <Field label="Năm">
              <Input name="year" type="number" min="2020" defaultValue={year} className="w-28" />
            </Field>
            <Button type="submit" variant="secondary">
              Xem
            </Button>
          </form>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Đã phát hành"
          tone="primary"
          value={formatCurrency(totals.expected)}
          hint={`${totals.paidCount + totals.unpaidCount} hóa đơn · kế hoạch ${formatCurrency(totals.planned)}`}
          icon={<CircleDollarSign className="h-5 w-5" />}
        />
        <StatCard
          label="Đã nộp"
          tone="success"
          value={formatCurrency(totals.paid)}
          hint={`Tỷ lệ thu ${percent(totals.collectionRate)} · ${totals.paidCount} hóa đơn`}
          icon={<Wallet className="h-5 w-5" />}
        />
        <StatCard
          label="Chưa thu tháng này"
          tone={totals.remaining > 0 ? "warning" : "success"}
          value={formatCurrency(totals.remaining)}
          hint={`${totals.unpaidCount} hóa đơn chưa thanh toán`}
          icon={<ReceiptText className="h-5 w-5" />}
        />
        <StatCard
          label="Công nợ lũy kế"
          tone={outstandingAllTime.amount > 0 ? "warning" : "success"}
          value={formatCurrency(outstandingAllTime.amount)}
          hint={`${outstandingAllTime.invoiceCount} hóa đơn · ${outstandingAllTime.olderThanThisMonth} quá hạn`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-bold tracking-tight">Xu hướng 6 tháng</h2>
              <p className="mt-1 text-sm text-stone-600">
                Cột đậm là tiền đã thu, phần nhạt phía trên là khoản còn nợ của tháng đó.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-stone-500">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Đã thu
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-rose-200" /> Chưa thu
              </span>
            </div>
          </div>

          {/* Chiều cao cột tính bằng pixel: phần trăm không dùng được ở đây vì
              container flex không truyền xuống chiều cao xác định. */}
          <div className="mt-6 flex items-end gap-3">
            {trend.map((point) => {
              const total = point.collected + point.outstanding;
              const scale = (value: number) =>
                value <= 0 ? 0 : Math.max(3, Math.round((value / trendMax) * CHART_HEIGHT));
              const collectedHeight = scale(point.collected);
              const outstandingHeight = scale(point.outstanding);
              const isSelected = point.month === month && point.year === year;
              return (
                <Link
                  key={`${point.year}-${point.month}`}
                  href={`/admin?month=${point.month}&year=${point.year}`}
                  className="group flex min-w-0 flex-1 flex-col items-center gap-2"
                  title={`${formatMonth(point.month, point.year)}: thu ${formatCurrency(point.collected)}, nợ ${formatCurrency(point.outstanding)}`}
                >
                  <span className="h-4 text-[11px] font-semibold text-stone-500 opacity-0 transition-opacity group-hover:opacity-100">
                    {total > 0 ? formatCurrency(total) : ""}
                  </span>
                  <div
                    className="flex w-full flex-col justify-end"
                    style={{ height: `${CHART_HEIGHT}px` }}
                  >
                    {outstandingHeight > 0 ? (
                      <div
                        className="w-full rounded-t-md bg-rose-200"
                        style={{ height: `${outstandingHeight}px` }}
                      />
                    ) : null}
                    {collectedHeight > 0 ? (
                      <div
                        className={`w-full ${outstandingHeight > 0 ? "" : "rounded-t-md"} ${
                          isSelected
                            ? "bg-gradient-to-b from-indigo-500 to-primary"
                            : "bg-indigo-300 transition-colors group-hover:bg-primary"
                        }`}
                        style={{ height: `${collectedHeight}px` }}
                      />
                    ) : null}
                    {total === 0 ? (
                      <div className="w-full rounded-t-md border-b-2 border-dashed border-stone-200" />
                    ) : null}
                  </div>
                  <span
                    className={`text-xs font-semibold ${isSelected ? "text-primary" : "text-stone-500"}`}
                  >
                    {point.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </Panel>

        <Panel className="h-fit">
          <h2 className="text-base font-bold tracking-tight">Việc cần làm</h2>
          {actionItems.length === 0 ? (
            <p className="mt-3 text-sm text-stone-600">
              Không có việc nào tồn đọng. Hóa đơn đã phát hành đủ và không còn giao dịch chờ đối soát.
            </p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {actionItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={`focus-ring flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                      item.tone === "warning"
                        ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50"
                        : "border-stone-200 bg-white hover:bg-stone-50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        item.tone === "warning" ? "text-amber-700" : "text-stone-400"
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-stone-700">{item.text}</span>
                      <span className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                        {item.cta}
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {dashboard.classes.length === 0 ? (
        <EmptyState title="Chưa có lớp học nào" icon={<Users className="h-6 w-6" />}>
          <Link href="/admin/classes" className="font-semibold text-primary hover:underline">
            Tạo lớp đầu tiên
          </Link>
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 p-5">
            <h2 className="text-base font-bold tracking-tight">Theo lớp</h2>
            <div className="flex items-center gap-3 text-sm text-stone-500">
              <Users className="h-4 w-4" />
              {totals.students} học sinh đang học
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Đã / Chưa đóng</th>
                  <th className="px-4 py-3">Tỷ lệ thu</th>
                  <th className="px-4 py-3">Đã phát hành</th>
                  <th className="px-4 py-3">Đã nộp</th>
                  <th className="px-4 py-3">Công nợ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dashboard.classes.map((classRoom) => (
                  <tr key={classRoom.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{classRoom.name}</div>
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <span>{classRoom.shortCode}</span>
                        {classRoom.archivedAt ? <Badge tone="neutral">Đã lưu trữ</Badge> : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{classRoom.teacherName || "-"}</td>
                    <td className="px-4 py-3">
                      {classRoom.activeStudents}
                      {classRoom.unissuedCount > 0 ? (
                        <div className="text-xs text-amber-700">
                          {classRoom.unissuedCount} chưa phát hành
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <Badge tone="success" dot>{classRoom.paidCount}</Badge>
                        <Badge tone={classRoom.unpaidCount > 0 ? "warning" : "neutral"} dot>
                          {classRoom.unpaidCount}
                        </Badge>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded-full bg-stone-100">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-success"
                            style={{ width: `${Math.round(classRoom.collectionRate * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-stone-600">
                          {percent(classRoom.collectionRate)}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">
                      {formatCurrency(classRoom.expectedAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-success">
                      {formatCurrency(classRoom.paidAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-warning">
                      {formatCurrency(classRoom.remainingAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/classes?classId=${classRoom.id}&month=${month}&year=${year}`}
                        className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-primary transition-colors hover:bg-indigo-50"
                      >
                        Chi tiết
                        <ArrowRight className="h-4 w-4" />
                      </Link>
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
