import Link from "next/link";
import { Banknote, CalendarCheck, Hourglass, Users } from "lucide-react";
import { deleteExpenseAction } from "@/lib/actions/finance";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { CopyTextButton, SalaryPayoutButton, type PayoutOption } from "@/components/SalaryForms";
import { SalaryMonthCutoffs, type MonthCutoffRow } from "@/components/SalaryMonthCutoffs";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { periodIndex } from "@/lib/enrollment-period";
import { formatCurrency, formatDayMonth, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  buildTeacherSalaryMessage,
  getPendingSalaryLines,
  loadDefaultSalaryCutoff,
  loadSalaryLedger,
  loadSalaryMonthCutoffs,
  salaryLineNotes,
  type LedgerClass,
  type SalaryLine,
  type TeacherLedger
} from "@/lib/salary";
import { cutoffResolver, describeSalaryCutoff, salaryCutoffDate } from "@/lib/salary-cutoff";

export const dynamic = "force-dynamic";

const RANGES = [3, 6, 12] as const;
const NO_TEACHER = "__none";

function periodKey(classId: string, period: Pick<SalaryLine, "month" | "year">) {
  return `${classId}:${period.year}:${period.month}`;
}

function payoutOptions(teacher: TeacherLedger): PayoutOption[] {
  return teacher.classes.flatMap((classRoom) =>
    classRoom.periods
      .filter((period) => period.mode === "percent" && period.difference !== 0)
      .map((period) => ({
        key: periodKey(classRoom.classId, period),
        classId: classRoom.classId,
        className: classRoom.className,
        shortCode: classRoom.shortCode,
        month: period.month,
        year: period.year,
        due: period.due,
        paidOut: period.paidOut,
        remaining: period.difference,
        waitingCount: period.cutoffPassed ? 0 : period.waiting.length
      }))
  );
}

function dateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function teacherParam(teacher: TeacherLedger) {
  return teacher.teacherName || NO_TEACHER;
}

export default async function SalaryPage({
  searchParams
}: {
  searchParams: Promise<{ teacher?: string; range?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range = RANGES.find((value) => String(value) === params.range) ?? 6;
  const selectedTeacher = params.teacher ?? "";

  const now = new Date();
  const currentIndex = periodIndex(now.getMonth() + 1, now.getFullYear());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const pending = await getPendingSalaryLines(now);
  // Kỳ cũ còn lệch lương luôn được đưa vào sổ dù nằm ngoài khoảng đang xem.
  const fromIndex = Math.min(
    currentIndex - (range - 1),
    ...pending.map((line) => periodIndex(line.month, line.year))
  );

  const [ledger, paidThisMonth, defaultCutoff, monthCutoffs] = await Promise.all([
    loadSalaryLedger({ fromIndex, toIndex: currentIndex }),
    prisma.expense.aggregate({
      where: { category: "teacher_salary", classId: { not: null }, paidAt: { gte: monthStart } },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    loadDefaultSalaryCutoff(),
    loadSalaryMonthCutoffs()
  ]);

  const resolver = cutoffResolver(
    defaultCutoff,
    new Map(monthCutoffs.map((item) => [periodIndex(item.month, item.year), item.cutoffDate]))
  );
  const cutoffRows: MonthCutoffRow[] = Array.from({ length: currentIndex - fromIndex + 1 }, (_, offset) => {
    const index = fromIndex + offset;
    const month = (index % 12) + 1;
    const year = Math.floor(index / 12);
    return {
      month,
      year,
      value: dateInputValue(resolver.date(index)),
      defaultLabel: formatDayMonth(salaryCutoffDate(defaultCutoff, index)),
      overridden: resolver.overridden(index),
      min: dateInputValue(new Date(year, month - 1, 1)),
      max: dateInputValue(new Date(year, month + 1, 0))
    };
  });

  const shown = selectedTeacher ? ledger.filter((teacher) => teacherParam(teacher) === selectedTeacher) : ledger;
  const owedTotal = ledger.reduce((sum, teacher) => sum + teacher.owed, 0);
  const waitingTotal = ledger.reduce((sum, teacher) => sum + teacher.waitingShare, 0);
  const currentDue = ledger
    .flatMap((teacher) => teacher.classes.flatMap((classRoom) => classRoom.periods))
    .filter((period) => periodIndex(period.month, period.year) === currentIndex)
    .reduce((sum, period) => sum + period.due, 0);
  const pendingPast = pending.filter((line) => line.difference > 0);

  const chipHref = (teacher: string, nextRange = range) => {
    const search = new URLSearchParams();
    if (teacher) search.set("teacher", teacher);
    if (nextRange !== 6) search.set("range", String(nextRange));
    const query = search.toString();
    return query ? `/admin/salary?${query}` : "/admin/salary";
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Lương giáo viên"
        description="Lương tháng = % của lớp × học phí nộp đến hết ngày chốt (cộng tiền nộp muộn của tháng trước). Học sinh nộp sau ngày chốt tự chuyển sang lương tháng sau, có ghi chú tên. Ghi lại từng lần chuyển tiền cho giáo viên."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Còn nợ giáo viên"
          tone={owedTotal > 0 ? "warning" : "success"}
          value={formatCurrency(owedTotal)}
          hint={
            pendingPast.length > 0
              ? `${pendingPast.length} lớp-kỳ trước chưa chuyển đủ`
              : "Các kỳ trước đã chuyển đủ"
          }
          icon={<Banknote className="h-5 w-5" />}
        />
        <StatCard
          label="Chờ học sinh nộp"
          tone="primary"
          value={formatCurrency(waitingTotal)}
          hint="Phần lương thêm nếu HS chưa nộp kịp nộp trước ngày chốt"
          icon={<Hourglass className="h-5 w-5" />}
        />
        <StatCard
          label={`Phải trả ${formatMonth(now.getMonth() + 1, now.getFullYear())}`}
          tone="neutral"
          value={formatCurrency(currentDue)}
          hint="Theo học phí đã nộp tính đến hôm nay"
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          label="Đã chuyển trong tháng này"
          tone="success"
          value={formatCurrency(paidThisMonth._sum.amount ?? 0)}
          hint={`${paidThisMonth._count._all} lần chuyển (mọi kỳ) · đối chiếu sao kê`}
          icon={<CalendarCheck className="h-5 w-5" />}
        />
      </div>

      <Panel className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={chipHref("")}
            className={`focus-ring inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
              !selectedTeacher
                ? "bg-primary text-white ring-primary"
                : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
            }`}
          >
            Tất cả giáo viên
          </Link>
          {ledger.map((teacher) => {
            const value = teacherParam(teacher);
            const active = selectedTeacher === value;
            return (
              <Link
                key={value}
                href={chipHref(value)}
                className={`focus-ring inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold ring-1 ring-inset transition-colors ${
                  active
                    ? "bg-primary text-white ring-primary"
                    : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                }`}
              >
                {teacher.teacherName || "Chưa ghi tên GV"}
                {teacher.owed > 0 ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      active ? "bg-white/20 text-white" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    nợ {formatCurrency(teacher.owed)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-stone-600">
          <span>Xem:</span>
          {RANGES.map((value) => (
            <Link
              key={value}
              href={chipHref(selectedTeacher, value)}
              className={`focus-ring rounded-lg px-2.5 py-1 font-semibold ${
                value === range ? "bg-indigo-50 text-primary" : "hover:bg-stone-100"
              }`}
            >
              {value} tháng gần nhất
            </Link>
          ))}
          {fromIndex < currentIndex - (range - 1) ? (
            <span className="text-xs text-amber-700">· kèm các kỳ cũ hơn còn nợ lương</span>
          ) : null}
        </div>
      </Panel>

      <SalaryMonthCutoffs rows={cutoffRows} ruleLabel={describeSalaryCutoff(defaultCutoff)} />

      {shown.length === 0 ? (
        <EmptyState title="Chưa có lương giáo viên để theo dõi" icon={<Users className="h-6 w-6" />}>
          Khai % lương giáo viên ở Lớp học → Sửa lớp. Khi có học phí đã thu, lương từng tháng sẽ tự hiện ở đây.
        </EmptyState>
      ) : (
        shown.map((teacher) => (
          <TeacherPanel key={teacherParam(teacher)} teacher={teacher} currentIndex={currentIndex} now={now} />
        ))
      )}
    </div>
  );
}

function TeacherPanel({ teacher, currentIndex, now }: { teacher: TeacherLedger; currentIndex: number; now: Date }) {
  const options = payoutOptions(teacher);
  const owedKeys = options.filter((option) => option.remaining > 0).map((option) => option.key);

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-stone-200 bg-gradient-to-r from-indigo-50/70 to-white p-5">
        <div>
          <h2 className="text-lg font-bold text-neutralText">{teacher.teacherName || "Chưa ghi tên giáo viên"}</h2>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <div className="flex gap-1.5">
              <dt className="text-stone-500">Phải trả</dt>
              <dd className="font-semibold">{formatCurrency(teacher.due)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-stone-500">Đã chuyển</dt>
              <dd className="font-semibold text-success">{formatCurrency(teacher.paidOut)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-stone-500">Còn nợ</dt>
              <dd className={`font-bold ${teacher.owed > 0 ? "text-warning" : "text-stone-400"}`}>
                {formatCurrency(teacher.owed)}
              </dd>
            </div>
            {teacher.waitingShare > 0 ? (
              <div className="flex gap-1.5">
                <dt className="text-stone-500">Chờ HS nộp</dt>
                <dd className="font-semibold text-primary">{formatCurrency(teacher.waitingShare)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyTextButton
            text={buildTeacherSalaryMessage(teacher, now)}
            label="Chép bảng lương"
            successMessage={`Đã chép bảng lương ${teacher.teacherName || "giáo viên"} — dán vào Zalo để gửi.`}
          />
          {options.length > 0 ? (
            <SalaryPayoutButton
              teacherName={teacher.teacherName}
              options={options}
              initialKeys={owedKeys}
              label="Ghi chuyển lương"
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-0 divide-y divide-stone-200">
        {teacher.classes.map((classRoom) => (
          <ClassLedger
            key={classRoom.classId}
            teacherName={teacher.teacherName}
            classRoom={classRoom}
            options={options}
            currentIndex={currentIndex}
          />
        ))}
      </div>
    </Panel>
  );
}

function ClassLedger({
  teacherName,
  classRoom,
  options,
  currentIndex
}: {
  teacherName: string;
  classRoom: LedgerClass;
  options: PayoutOption[];
  currentIndex: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-2 pt-4">
        <h3 className="font-bold">{classRoom.className}</h3>
        <span className="text-xs text-stone-500">
          {classRoom.shortCode} · {classRoom.classSharePercent}% học phí · chốt lương{" "}
          {describeSalaryCutoff(classRoom.cutoff)}
          {classRoom.customCutoff ? " (riêng lớp này)" : ""}
        </span>
        <Link
          href={`/admin/classes?classId=${classRoom.classId}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          Đổi ngày chốt
        </Link>
        {classRoom.archived ? <Badge tone="neutral">Đã lưu trữ</Badge> : null}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] text-left text-sm">
          <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5">Tháng lương</th>
              <th className="px-4 py-2.5 text-right">Phải trả</th>
              <th className="px-4 py-2.5">Đã chuyển</th>
              <th className="px-4 py-2.5 text-right">Còn nợ</th>
              <th className="px-4 py-2.5">Ghi chú tự động</th>
              <th className="px-4 py-2.5">Tình trạng</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {classRoom.periods.map((period) => {
              const isCurrent = periodIndex(period.month, period.year) === currentIndex;
              const key = periodKey(classRoom.classId, period);
              const notes = salaryLineNotes(period);
              return (
                <tr key={key} className={`align-top ${isCurrent ? "bg-indigo-50/30" : "hover:bg-stone-50/60"}`}>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="font-semibold">
                      T{period.month}/{period.year}
                      {isCurrent ? <span className="ml-1.5 text-xs font-medium text-primary">tháng này</span> : null}
                    </div>
                    <div className="text-xs text-stone-500">
                      chốt {formatDayMonth(period.cutoffDate)}
                      {period.cutoffOverridden ? " (đặt riêng)" : ""}
                      {period.cutoffPassed ? "" : " (chưa tới)"}
                    </div>
                    <div className="text-xs text-stone-500">
                      {period.mode === "percent" ? `${period.sharePercent}% × ${formatCurrency(period.collected)}` : "nhập tay"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatCurrency(period.due)}</td>
                  <td className="px-4 py-3">
                    {period.payouts.length === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <ul className="grid gap-1">
                        {period.payouts.map((payout, index) => (
                          <li key={payout.id} className="flex items-start gap-1.5">
                            <div className="min-w-0">
                              <div className="whitespace-nowrap">
                                <span className={`font-semibold ${payout.amount < 0 ? "text-primary" : "text-success"}`}>
                                  {formatCurrency(payout.amount)}
                                </span>
                                <span className="ml-1.5 text-xs text-stone-500">
                                  {index === 0 ? "" : payout.amount < 0 ? "trừ · " : "thêm · "}
                                  {formatDayMonth(payout.paidAt ?? payout.createdAt)}
                                </span>
                              </div>
                              {payout.note ? <div className="text-xs text-stone-500">{payout.note}</div> : null}
                            </div>
                            <ConfirmDeleteButton
                              id={payout.id}
                              action={deleteExpenseAction}
                              title="Xóa lần chuyển này"
                              description={
                                <>
                                  Xóa lần chuyển <strong>{formatCurrency(payout.amount)}</strong> ngày{" "}
                                  {formatDayMonth(payout.paidAt ?? payout.createdAt)} cho {classRoom.className} T
                                  {period.month}/{period.year}? Số này sẽ quay lại phần còn nợ giáo viên.
                                </>
                              }
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-bold ${
                      period.difference > 0 ? "text-warning" : period.difference < 0 ? "text-primary" : "text-stone-400"
                    }`}
                  >
                    {period.difference === 0 ? "—" : formatCurrency(period.difference)}
                  </td>
                  <td className="max-w-[320px] px-4 py-3 text-xs leading-relaxed text-stone-600">
                    {notes.length === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <div className="grid gap-1">
                        {notes.map((note) => (
                          <div key={note.tone}>
                            <span
                              className={`font-semibold ${
                                note.tone === "in"
                                  ? "text-emerald-700"
                                  : note.tone === "out"
                                    ? "text-amber-700"
                                    : "text-primary"
                              }`}
                            >
                              {note.label}:
                            </span>{" "}
                            {note.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={period.status.tone} dot>
                      {period.status.label}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {period.mode === "percent" && period.difference !== 0 ? (
                      <SalaryPayoutButton
                        teacherName={teacherName}
                        options={options}
                        initialKeys={[key]}
                        label={period.difference > 0 ? "Chuyển" : "Trừ lại"}
                        variant={period.difference > 0 ? "accent" : "secondary"}
                        compact
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-stone-200 bg-stone-50/60 text-sm">
            <tr>
              <td className="px-4 py-2.5 font-semibold text-stone-600">Cộng</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold">{formatCurrency(classRoom.due)}</td>
              <td className="whitespace-nowrap px-4 py-2.5 font-bold text-success">
                {formatCurrency(classRoom.paidOut)}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-2.5 text-right font-bold ${
                  classRoom.owed > 0 ? "text-warning" : "text-stone-400"
                }`}
              >
                {classRoom.owed > 0 ? formatCurrency(classRoom.owed) : "—"}
              </td>
              <td colSpan={3} className="px-4 py-2.5 text-xs text-stone-500">
                {classRoom.waitingShare > 0
                  ? `Chờ HS nộp trước ngày chốt: +${formatCurrency(classRoom.waitingShare)}`
                  : ""}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
