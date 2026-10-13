import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarCheck2,
  CalendarClock,
  CircleDollarSign,
  Clock3,
  FilePlus2,
  HandCoins,
  ListTodo,
  PieChart,
  ReceiptText,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import { clsx } from "clsx";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { getDashboard, type TrendPoint } from "@/lib/dashboard";
import { getDashboardInsights } from "@/lib/dashboard-insights";
import { formatCurrency, formatDayMonth, formatMonth } from "@/lib/format";
import { formatIsoDayMonth } from "@/lib/class-sessions";
import { classDot, STATUS_STYLE } from "@/components/schedule/styles";
import { requireStaff } from "@/lib/auth";
import { MonthSwitcher } from "@/components/MonthSwitcher";

export const dynamic = "force-dynamic";

/** Chiều cao vùng vẽ cột của biểu đồ học phí / học sinh, tính bằng pixel. */
const CHART_HEIGHT = 200;
const STUDENT_CHART_HEIGHT = 80;

/** Số tiền rút gọn cho nhãn trên cột (31,6tr, 850k) để vừa cột hẹp trên điện thoại. */
function formatCompact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

/** Tiêu đề khối: ô icon màu nhạt + tên + mô tả ngắn. Mỗi khối một tông để dễ phân biệt. */
const SECTION_TONES = {
  indigo: "bg-indigo-50 text-indigo-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  stone: "bg-stone-100 text-stone-600"
} as const;

function SectionTitle({
  icon,
  tone,
  title,
  description,
  action
}: {
  icon: React.ReactNode;
  tone: keyof typeof SECTION_TONES;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={clsx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", SECTION_TONES[tone])}>{icon}</span>
        <div>
          <h2 className="text-base font-bold tracking-tight">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-stone-500">{description}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="focus-ring inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-neutralText">
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/** Làm tròn lên mức chia đẹp để trục học phí có 4 khoảng dễ đọc (10tr, 20tr, 30tr, 40tr…). */
function niceCeil(value: number) {
  if (value <= 0) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

/**
 * Lưới chung của hai biểu đồ xu hướng: cột đầu là nhãn dòng / trục, sau đó mỗi tháng một cột.
 * Điện thoại chỉ hiện 6 tháng cuối cho cột đủ rộng (8 = TREND_MONTHS trong lib/dashboard).
 */
const TREND_GRID = "grid grid-cols-[3.25rem_repeat(6,minmax(0,1fr))] sm:grid-cols-[4.5rem_repeat(8,minmax(0,1fr))]";

type TrendProps = { trend: TrendPoint[]; month: number; year: number };

function trendColumnClass(index: number, length: number, isSelected: boolean) {
  return clsx(
    "group min-w-0 flex-col rounded-t-lg transition-colors",
    index < length - 6 ? "hidden sm:flex" : "flex",
    isSelected ? "bg-indigo-50/80" : "hover:bg-stone-50"
  );
}

/** Ô nhãn dòng ở cột đầu, cùng chiều cao và đường kẻ với các ô số của từng tháng. */
function TrendRowLabel({ children, short, strong = false }: { children?: React.ReactNode; short?: string; strong?: boolean }) {
  return (
    <span
      className={clsx(
        "h-7 truncate border-t text-[10px] font-semibold uppercase leading-7 tracking-wide text-stone-400 sm:text-[11px]",
        strong ? "border-stone-300" : "border-stone-100"
      )}
    >
      {short ? (
        <>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{children}</span>
        </>
      ) : (
        children
      )}
    </span>
  );
}

function TrendCell({ children, strong = false, className }: { children: React.ReactNode; strong?: boolean; className?: string }) {
  return (
    <span
      className={clsx(
        "h-7 truncate border-t text-center text-[11px] font-semibold leading-7 tabular-nums sm:text-xs",
        strong ? "border-stone-300" : "border-stone-100",
        className
      )}
    >
      {children}
    </span>
  );
}

function TrendHeader({ title, hint, legend }: { title: string; hint: string; legend: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
      <div>
        <p className="text-sm font-bold text-neutralText">{title}</p>
        <p className="text-xs text-stone-500">{hint}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-600">{legend}</div>
    </div>
  );
}

function LegendSwatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx("h-2.5 w-2.5 rounded-sm", className)} />
      {children}
    </span>
  );
}

/** Học phí từng tháng: cột xanh là đã thu, phần vàng chồng lên là còn nợ; dưới cột là tỷ lệ thu. */
function FeeTrend({ trend, month, year }: TrendProps) {
  const axisMax = niceCeil(Math.max(0, ...trend.map((point) => point.collected + point.outstanding)));
  const ticks = [1, 0.75, 0.5, 0.25];
  const scale = (value: number) => (value <= 0 ? 0 : Math.max(3, Math.round((value / axisMax) * CHART_HEIGHT)));

  return (
    <div className="rounded-xl border border-stone-200/80 p-3 sm:p-4">
      <TrendHeader
        title="Học phí"
        hint="Số trên cột là tổng hóa đơn đã phát hành của tháng."
        legend={
          <>
            <LegendSwatch className="bg-indigo-400">Đã thu</LegendSwatch>
            <LegendSwatch className="bg-amber-300">Chưa thu</LegendSwatch>
          </>
        }
      />
      <div className={clsx(TREND_GRID, "mt-3")}>
        <div className="flex min-w-0 flex-col">
          <span className="h-5" />
          {/* Trục giá trị: nhãn nằm ngang đúng vạch kẻ của vùng cột bên phải. */}
          <div className="relative" style={{ height: `${CHART_HEIGHT}px` }}>
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-stone-400 sm:text-[11px]"
                style={{ top: `${(1 - tick) * 100}%` }}
              >
                {formatCompact(axisMax * tick)}
              </span>
            ))}
          </div>
          <TrendRowLabel strong>Tháng</TrendRowLabel>
          <TrendRowLabel short="% thu">Tỷ lệ thu</TrendRowLabel>
        </div>
        {trend.map((point, index) => {
          const total = point.collected + point.outstanding;
          const collectedHeight = scale(point.collected);
          const outstandingHeight = scale(point.outstanding);
          const rate = total > 0 ? point.collected / total : null;
          const isSelected = point.month === month && point.year === year;
          return (
            <Link
              key={`${point.year}-${point.month}`}
              href={`/admin?month=${point.month}&year=${point.year}`}
              className={trendColumnClass(index, trend.length, isSelected)}
              title={`${formatMonth(point.month, point.year)}: đã thu ${formatCurrency(point.collected)}, chưa thu ${formatCurrency(point.outstanding)}`}
            >
              <span
                className={clsx(
                  "h-5 truncate text-center text-[10px] font-bold leading-5 tabular-nums sm:text-[11px]",
                  isSelected ? "text-primary" : "text-stone-600"
                )}
              >
                {total > 0 ? formatCompact(total) : ""}
              </span>
              <div className="relative" style={{ height: `${CHART_HEIGHT}px` }}>
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute inset-x-0 border-t border-dashed border-stone-200/80"
                    style={{ top: `${(1 - tick) * 100}%` }}
                  />
                ))}
                <div className="absolute inset-x-1 bottom-0 flex justify-center sm:inset-x-1.5">
                  <div className="flex w-full max-w-12 flex-col justify-end">
                    {outstandingHeight > 0 ? (
                      <div className="w-full rounded-t-md bg-amber-300" style={{ height: `${outstandingHeight}px` }} />
                    ) : null}
                    {collectedHeight > 0 ? (
                      <div
                        className={clsx(
                          "w-full",
                          outstandingHeight > 0 ? "" : "rounded-t-md",
                          isSelected ? "bg-gradient-to-b from-indigo-500 to-primary" : "bg-indigo-300 transition-colors group-hover:bg-indigo-400"
                        )}
                        style={{ height: `${collectedHeight}px` }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
              <TrendCell strong className={isSelected ? "text-primary" : "text-stone-600"}>
                {point.label}
              </TrendCell>
              <TrendCell
                className={
                  rate === null
                    ? "text-stone-300"
                    : rate >= 0.8
                      ? "text-emerald-600"
                      : rate >= 0.5
                        ? "text-amber-600"
                        : "text-rose-600"
                }
              >
                {rate === null ? "—" : percent(rate)}
              </TrendCell>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Học sinh từng tháng: số đang học (trên cột), lượt vào học và lượt nghỉ mới ở hai dòng riêng. */
function StudentTrend({ trend, month, year }: TrendProps) {
  const studentMax = Math.max(1, ...trend.map((point) => point.students));

  return (
    <div className="rounded-xl border border-stone-200/80 p-3 sm:p-4">
      <TrendHeader
        title="Học sinh"
        hint="Số học sinh có học trong tháng, kèm lượt vào học và lượt nghỉ mới."
        legend={
          <>
            <LegendSwatch className="bg-sky-400">Đang học</LegendSwatch>
            <span className="font-semibold text-emerald-600">+ vào học</span>
            <span className="font-semibold text-rose-600">− nghỉ</span>
          </>
        }
      />
      <div className={clsx(TREND_GRID, "mt-3")}>
        <div className="flex min-w-0 flex-col">
          <span className="h-6 truncate text-[10px] font-semibold uppercase leading-6 tracking-wide text-stone-400 sm:text-[11px]">Số HS</span>
          <div style={{ height: `${STUDENT_CHART_HEIGHT}px` }} />
          <TrendRowLabel strong>Tháng</TrendRowLabel>
          <TrendRowLabel short="Vào">Vào học</TrendRowLabel>
          <TrendRowLabel>Nghỉ</TrendRowLabel>
        </div>
        {trend.map((point, index) => {
          const isSelected = point.month === month && point.year === year;
          const height = point.students > 0 ? Math.max(4, Math.round((point.students / studentMax) * STUDENT_CHART_HEIGHT)) : 0;
          return (
            <Link
              key={`${point.year}-${point.month}`}
              href={`/admin?month=${point.month}&year=${point.year}`}
              className={trendColumnClass(index, trend.length, isSelected)}
              title={`${formatMonth(point.month, point.year)}: ${point.students} học sinh, +${point.joined} vào học, −${point.left} nghỉ`}
            >
              <span
                className={clsx(
                  "h-6 text-center text-sm font-bold leading-6 tabular-nums",
                  isSelected ? "text-sky-700" : point.students > 0 ? "text-neutralText" : "text-stone-300"
                )}
              >
                {point.students}
              </span>
              <div className="flex justify-center px-1 sm:px-1.5" style={{ height: `${STUDENT_CHART_HEIGHT}px` }}>
                <div className="flex w-full max-w-12 flex-col justify-end">
                  {height > 0 ? (
                    <div
                      className={clsx(
                        "w-full rounded-t-md",
                        isSelected ? "bg-gradient-to-b from-sky-400 to-sky-600" : "bg-sky-200 transition-colors group-hover:bg-sky-300"
                      )}
                      style={{ height: `${height}px` }}
                    />
                  ) : null}
                </div>
              </div>
              <TrendCell strong className={isSelected ? "text-primary" : "text-stone-600"}>
                {point.label}
              </TrendCell>
              <TrendCell className={point.joined > 0 ? "text-emerald-600" : "text-stone-300"}>
                {point.joined > 0 ? `+${point.joined}` : "0"}
              </TrendCell>
              <TrendCell className={point.left > 0 ? "text-rose-600" : "text-stone-300"}>
                {point.left > 0 ? `−${point.left}` : "0"}
              </TrendCell>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default async function AdminHomePage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const user = await requireStaff();
  const isOwner = user.role === "owner";
  // Quản lý phụ nhập số buổi ở trang Lớp học riêng, không mở được trang Lớp học của chủ.
  const classesHref = "/admin/classes";
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

  const [dashboard, insights] = await Promise.all([getDashboard(month, year), getDashboardInsights(month, year)]);
  const { totals, alerts, outstandingAllTime, trend } = dashboard;

  const actionItems = [
    // Tạo hóa đơn là việc của chủ trung tâm; quản lý phụ chỉ nhập số buổi.
    isOwner && totals.unissued > 0
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
          cta: isOwner ? "Đối soát" : "Xem giao dịch"
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
    isOwner && alerts.classesWithoutSchedule > 0
      ? {
          key: "schedule",
          tone: "neutral" as const,
          icon: <CalendarClock className="h-4 w-4" />,
          text: `${alerts.classesWithoutSchedule} lớp chưa xếp thời khóa biểu.`,
          href: "/admin/schedule",
          cta: "Xếp lịch"
        }
      : null,
    isOwner && alerts.salaryPending > 0
      ? {
          key: "salary",
          tone: "neutral" as const,
          icon: <Wallet className="h-4 w-4" />,
          text: `${alerts.salaryPending} lớp-kỳ trước còn lệch lương giáo viên (học sinh nộp muộn sau khi đã chuyển lương, hoặc học phí bị hoàn).`,
          href: "/admin/salary",
          cta: "Mở Lương GV"
        }
      : null
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  // Cơ cấu hóa đơn tháng: đã đóng / chưa đóng / chưa phát hành / miễn.
  const waivedCount = dashboard.classes.reduce((sum, row) => sum + row.waivedCount, 0);
  const waivedAmount = dashboard.classes.reduce((sum, row) => sum + row.waivedAmount, 0);
  // "Chưa phát hành" là học sinh đang học chưa có hóa đơn nên không có số tiền.
  const mix = [
    { key: "paid", label: "Đã đóng", count: totals.paidCount, amount: totals.paid, color: "#10b981", dot: "bg-emerald-500" },
    { key: "unpaid", label: "Chưa đóng", count: totals.unpaidCount, amount: totals.remaining, color: "#f59e0b", dot: "bg-amber-500" },
    { key: "unissued", label: "Chưa phát hành", count: totals.unissued, amount: null, color: "#d6d3d1", dot: "bg-stone-300" },
    { key: "waived", label: "Miễn học phí", count: waivedCount, amount: waivedAmount, color: "#818cf8", dot: "bg-indigo-400" }
  ];
  const mixTotal = mix.reduce((sum, item) => sum + item.count, 0);
  let mixCursor = 0;
  const donut =
    mixTotal === 0
      ? "#e7e5e4 0 100%"
      : mix
          .map((item) => {
            const from = mixCursor;
            mixCursor += (item.count / mixTotal) * 100;
            return `${item.color} ${from}% ${mixCursor}%`;
          })
          .join(", ");

  const { attendance } = insights;
  const attendanceSegments = [
    { key: "held", label: "Đã học", value: attendance.held, bar: "bg-emerald-500" },
    { key: "makeup", label: "Học bù", value: attendance.makeup, bar: "bg-violet-500" },
    { key: "cancelled", label: "Lớp nghỉ", value: attendance.cancelled, bar: "bg-rose-400" },
    { key: "pending", label: "Chưa điểm danh", value: attendance.pending, bar: "bg-amber-400" },
    { key: "upcoming", label: "Sắp tới", value: attendance.upcoming, bar: "bg-stone-200" }
  ];
  // Lớp thu thấp nhất lên đầu, tối đa 4 lớp (bảng "Theo lớp" bên dưới có đủ mọi lớp).
  const rankedClasses = [...dashboard.classes]
    .filter((row) => row.expectedAmount > 0)
    .sort((left, right) => left.collectionRate - right.collectionRate);
  const classRanking = rankedClasses.slice(0, 4);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={`Tổng quan ${formatMonth(month, year)}`}
        description={
          dashboard.isCurrentPeriod
            ? `Hôm nay ${formatIsoDayMonth(insights.today)} · theo dõi học phí, lịch học và công nợ của trung tâm.`
            : "Đang xem số liệu của một tháng trong quá khứ hoặc tương lai."
        }
        actions={<MonthSwitcher basePath="/admin" month={month} year={year} />}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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

      {/* Dải số liệu phụ: tiền về, học sinh, buổi học. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-200/80 shadow-soft xl:grid-cols-5">
        {[
          {
            icon: <HandCoins className="h-4 w-4" />,
            tone: "text-emerald-600",
            label: "Tiền về trong tháng",
            value: formatCurrency(insights.cashIn.total),
            hint: `${insights.cashIn.count} giao dịch · tiền mặt ${formatCurrency(insights.cashIn.cash)}`
          },
          {
            icon: <Users className="h-4 w-4" />,
            tone: "text-sky-600",
            label: "Học sinh đang học",
            value: String(insights.students.active),
            hint: `${totals.students} lượt học trong các lớp`
          },
          {
            icon: <UserPlus className="h-4 w-4" />,
            tone: "text-indigo-600",
            label: "Vào học tháng này",
            value: `+${insights.students.joined}`,
            hint: "Lượt ghi danh mới"
          },
          {
            icon: <UserMinus className="h-4 w-4" />,
            tone: "text-rose-600",
            label: "Nghỉ từ tháng này",
            value: insights.students.left > 0 ? `−${insights.students.left}` : "0",
            hint: "Lượt cho nghỉ lớp"
          },
          {
            icon: <CalendarCheck2 className="h-4 w-4" />,
            tone: "text-violet-600",
            label: "Buổi học tháng này",
            value: `${attendance.held + attendance.makeup}/${attendance.total}`,
            hint: `${attendance.cancelled} nghỉ · ${attendance.makeup} bù`
          }
        ].map((item, index) => (
          <div key={item.label} className={clsx("bg-white px-4 py-3.5 sm:px-5 sm:py-4", index === 0 && "col-span-2 xl:col-span-1")}>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500 sm:text-xs">
              <span className={item.tone}>{item.icon}</span>
              {item.label}
            </p>
            <p className="mt-2 text-xl font-bold tracking-tight text-neutralText">{item.value}</p>
            <p className="mt-0.5 text-xs text-stone-500">{item.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <SectionTitle
            icon={<TrendingUp className="h-5 w-5" />}
            tone="indigo"
            title={`Xu hướng ${trend.length} tháng`}
            description="Học phí và học sinh theo từng tháng. Bấm vào một cột để xem số liệu tháng đó."
          />
          <div className="mt-5 grid gap-4">
            <FeeTrend trend={trend} month={month} year={year} />
            <StudentTrend trend={trend} month={month} year={year} />
          </div>
        </Panel>

        <Panel>
          <SectionTitle icon={<PieChart className="h-5 w-5" />} tone="emerald" title="Tình trạng hóa đơn" description={formatMonth(month, year)} />
          <div className="mt-5 flex items-center gap-5">
            <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: `conic-gradient(${donut})` }}>
              <div className="absolute inset-[16px] grid place-items-center rounded-full bg-white text-center">
                <div>
                  <p className="text-xl font-bold tracking-tight text-neutralText">{percent(totals.collectionRate)}</p>
                  <p className="text-[11px] font-medium text-stone-500">tiền đã thu</p>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-xs text-stone-500">Đã thu</p>
              <p className="font-bold tabular-nums text-emerald-700">{formatCurrency(totals.paid)}</p>
              <p className="mt-2 text-xs text-stone-500">Trên tổng đã phát hành</p>
              <p className="font-bold tabular-nums text-neutralText">{formatCurrency(totals.expected)}</p>
            </div>
          </div>
          {/* Mỗi trạng thái một dòng: số hóa đơn và số tiền tách cột để không đọc lẫn. */}
          <div className="mt-5 overflow-hidden rounded-xl border border-stone-200/80">
            <div className="grid grid-cols-[minmax(0,1fr)_3rem_6.5rem] gap-2 bg-stone-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500">
              <span>Trạng thái</span>
              <span className="text-right">Số HĐ</span>
              <span className="text-right">Số tiền</span>
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              {mix.map((item) => (
                <li key={item.key} className="grid grid-cols-[minmax(0,1fr)_3rem_6.5rem] items-center gap-2 px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-stone-700">
                    <span className={clsx("h-2.5 w-2.5 shrink-0 rounded-full", item.dot)} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="text-right font-semibold tabular-nums text-neutralText">{item.count}</span>
                  <span className="truncate text-right tabular-nums text-stone-600">
                    {item.amount === null ? "—" : formatCurrency(item.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {classRanking.length > 0 ? (
            <div className="mt-5">
              <p className="flex items-baseline justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                Lớp thu thấp nhất
                {rankedClasses.length > classRanking.length ? (
                  <span className="font-medium normal-case tracking-normal text-stone-400">+{rankedClasses.length - classRanking.length} lớp khác</span>
                ) : null}
              </p>
              <ul className="mt-2 divide-y divide-stone-100">
                {classRanking.map((row) => (
                  <li key={row.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-stone-700">{row.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-neutralText">{percent(row.collectionRate)}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={clsx(
                          "h-full rounded-full",
                          row.collectionRate >= 0.8 ? "bg-emerald-500" : row.collectionRate >= 0.5 ? "bg-amber-400" : "bg-rose-400"
                        )}
                        style={{ width: `${Math.max(2, Math.round(row.collectionRate * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 flex justify-between gap-2 text-xs tabular-nums text-stone-500">
                      <span>
                        {row.paidCount}/{row.paidCount + row.unpaidCount} HĐ đã đóng
                      </span>
                      <span>còn {formatCurrency(row.remainingAmount)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        <Panel>
          <SectionTitle
            icon={<Clock3 className="h-5 w-5" />}
            tone="sky"
            title="Lịch học hôm nay"
            description={dashboard.isCurrentPeriod ? formatIsoDayMonth(insights.today) : "Chỉ hiện khi xem tháng hiện tại"}
            action={<SectionLink href="/admin/schedule">TKB</SectionLink>}
          />
          {insights.todaySessions.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-500">
              Hôm nay không có buổi học nào.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {insights.todaySessions.map((session) => (
                <li key={session.key} className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-2.5">
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-sm font-bold tabular-nums text-neutralText">{session.startTime}</p>
                    <p className="text-[11px] tabular-nums text-stone-400">{session.endTime}</p>
                  </div>
                  <span className={clsx("h-8 w-1 shrink-0 rounded-full", classDot(session.colorIndex))} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{session.className}</p>
                    <p className="truncate text-xs text-stone-500">{[session.teacherName, session.room].filter(Boolean).join(" · ") || " "}</p>
                  </div>
                  <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[session.status].chip)}>
                    {STATUS_STYLE[session.status].label}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <SectionTitle
            icon={<CalendarCheck2 className="h-5 w-5" />}
            tone="amber"
            title="Điểm danh tháng"
            description={`${attendance.total} buổi theo lịch và học bù`}
            action={<SectionLink href={`/admin/schedule?view=month&month=${month}&year=${year}`}>Điểm danh</SectionLink>}
          />
          <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-stone-100">
            {attendance.total > 0
              ? attendanceSegments.map((segment) =>
                  segment.value > 0 ? (
                    <div key={segment.key} className={segment.bar} style={{ width: `${(segment.value / attendance.total) * 100}%` }} title={`${segment.label}: ${segment.value}`} />
                  ) : null
                )
              : null}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
            {attendanceSegments.map((segment) => (
              <li key={segment.key} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-stone-600">
                  <span className={clsx("h-2.5 w-2.5 rounded-sm", segment.bar)} />
                  {segment.label}
                </span>
                <span className={clsx("font-semibold tabular-nums", segment.key === "pending" && segment.value > 0 ? "text-amber-700" : "text-neutralText")}>
                  {segment.value}
                </span>
              </li>
            ))}
          </ul>
          {attendance.pending > 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Còn {attendance.pending} buổi đã qua chưa điểm danh, số buổi thu tháng sau có thể chưa chính xác.
            </p>
          ) : null}
        </Panel>

        <Panel className="lg:col-span-2 xl:col-span-1">
          <SectionTitle icon={<ListTodo className="h-5 w-5" />} tone="rose" title="Việc cần làm" description={actionItems.length > 0 ? `${actionItems.length} việc tồn đọng` : "Đã xử lý hết"} />
          {actionItems.length === 0 ? (
            <p className="mt-4 rounded-xl bg-emerald-50 px-3 py-4 text-sm text-emerald-800">
              Không có việc nào tồn đọng. Hóa đơn đã phát hành đủ và không còn giao dịch chờ đối soát.
            </p>
          ) : (
            <ul className="mt-4 grid gap-2">
              {actionItems.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={clsx(
                      "focus-ring flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors",
                      item.tone === "warning" ? "border-amber-200 bg-amber-50/70 hover:bg-amber-50" : "border-stone-200 bg-white hover:bg-stone-50"
                    )}
                  >
                    <span className={clsx("mt-0.5 shrink-0", item.tone === "warning" ? "text-amber-700" : "text-stone-400")}>{item.icon}</span>
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

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel className="overflow-hidden p-0">
          <div className="p-5">
            <SectionTitle
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="rose"
              title="Nợ nhiều nhất"
              description="Cộng dồn mọi tháng còn nợ"
              action={<SectionLink href="/admin/debts">Công nợ</SectionLink>}
            />
          </div>
          {insights.topDebtors.length === 0 ? (
            <p className="mx-5 mb-5 rounded-xl bg-emerald-50 px-3 py-4 text-sm text-emerald-800">Không còn học sinh nào nợ học phí.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="border-y border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="w-10 px-4 py-2.5 text-center">#</th>
                    <th className="px-4 py-2.5">Học sinh</th>
                    <th className="px-4 py-2.5">Nợ từ</th>
                    <th className="px-4 py-2.5 text-right">Số tiền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {insights.topDebtors.map((debtor, index) => (
                    <tr key={debtor.studentId} className="transition-colors hover:bg-stone-50">
                      <td className="px-4 py-2.5 text-center tabular-nums text-stone-400">{index + 1}</td>
                      <td className="px-4 py-2.5">
                        <Link href={`/admin/students/${debtor.studentId}`} className="font-semibold text-neutralText hover:text-primary hover:underline">
                          {debtor.studentName}
                        </Link>
                        <p className="truncate text-xs text-stone-500">{debtor.classNames.join(", ")}</p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="text-stone-700">T{debtor.oldestMonth}/{debtor.oldestYear}</span>
                        <span className="block text-xs text-stone-400">{debtor.invoiceCount} hóa đơn</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold text-warning">{formatCurrency(debtor.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="p-5">
            <SectionTitle
              icon={<Banknote className="h-5 w-5" />}
              tone="emerald"
              title="Thanh toán gần đây"
              description="Giao dịch đã khớp hóa đơn mới nhất"
              action={<SectionLink href="/admin/transactions">Giao dịch</SectionLink>}
            />
          </div>
          {insights.recentPayments.length === 0 ? (
            <p className="mx-5 mb-5 rounded-xl border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-500">Chưa có giao dịch nào.</p>
          ) : (
            <ul className="divide-y divide-stone-100 border-t border-stone-200">
              {insights.recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-stone-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600">
                    {payment.method === "cash" ? <Wallet className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{payment.studentName ?? "Không rõ học sinh"}</p>
                    <p className="truncate text-xs text-stone-500">
                      {[payment.className, payment.month && payment.year ? `HP T${payment.month}/${payment.year}` : null, payment.method === "cash" ? "Tiền mặt" : "Chuyển khoản"]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-success">+{formatCurrency(payment.amount)}</p>
                    <p className="text-[11px] text-stone-400">{formatDayMonth(payment.transferredAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {dashboard.classes.length === 0 ? (
        <EmptyState title="Chưa có lớp học nào" icon={<Users className="h-6 w-6" />}>
          {isOwner ? (
            <Link href="/admin/classes" className="font-semibold text-primary hover:underline">
              Tạo lớp đầu tiên
            </Link>
          ) : (
            "Chủ trung tâm chưa tạo lớp nào."
          )}
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="p-5">
            <SectionTitle
              icon={<Users className="h-5 w-5" />}
              tone="stone"
              title="Theo lớp"
              description={`${totals.students} lượt học sinh đang học`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-y border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Đã / Chưa đóng</th>
                  <th className="px-4 py-3">Tỷ lệ thu</th>
                  <th className="px-4 py-3 text-right">Đã phát hành</th>
                  <th className="px-4 py-3 text-right">Đã nộp</th>
                  <th className="px-4 py-3 text-right">Công nợ</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {dashboard.classes.map((classRoom) => (
                  <tr key={classRoom.id} className="transition-colors hover:bg-stone-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{classRoom.name}</div>
                      <div className="flex items-center gap-2 text-xs text-stone-500">
                        <span>{classRoom.shortCode}</span>
                        {classRoom.archivedAt ? <Badge tone="neutral">Đã lưu trữ</Badge> : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{classRoom.teacherName || "-"}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {classRoom.activeStudents}
                      {classRoom.unissuedCount > 0 ? (
                        <div className="text-xs text-amber-700">{classRoom.unissuedCount} chưa phát hành</div>
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
                        <span className="text-xs font-semibold text-stone-600">{percent(classRoom.collectionRate)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-neutralText">
                      {formatCurrency(classRoom.expectedAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-success">
                      {formatCurrency(classRoom.paidAmount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-warning">
                      {formatCurrency(classRoom.remainingAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`${classesHref}?classId=${classRoom.id}&month=${month}&year=${year}`}
                        className="focus-ring inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 font-semibold text-primary transition-colors hover:bg-indigo-50"
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
