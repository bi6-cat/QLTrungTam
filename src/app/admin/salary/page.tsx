import Link from "next/link";
import { Archive, Banknote, CalendarCheck, Hourglass, Users } from "lucide-react";
import { deleteExpenseAction } from "@/lib/actions/finance";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import {
  PayslipButton,
  SalaryPayoutButton,
  SalaryWriteOffButton,
  type PayoutOption,
  type PayslipOption
} from "@/components/SalaryForms";
import { SalaryMonthCutoffs, type MonthCutoffRow } from "@/components/SalaryMonthCutoffs";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { periodIndex } from "@/lib/enrollment-period";
import { formatCurrency, formatDayMonth, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  buildSalaryLedger,
  buildTeacherPayslip,
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

/** Phiếu lương từng tháng (mới nhất trước) và cả bảng lương; mặc định là tháng gần nhất đã qua ngày chốt. */
function payslipOptions(teacher: TeacherLedger, now: Date) {
  const periods = teacher.classes.flatMap((classRoom) => classRoom.periods);
  const indexes = [...new Set(periods.map((period) => periodIndex(period.month, period.year)))].sort((a, b) => b - a);
  const slips: PayslipOption[] = indexes.map((index) => {
    const month = (index % 12) + 1;
    const year = Math.floor(index / 12);
    const provisional = periods.some(
      (period) => period.month === month && period.year === year && !period.cutoffPassed
    );
    return {
      key: String(index),
      label: `Phiếu T${month}/${year}${provisional ? " (tạm tính)" : ""}`,
      text: buildTeacherPayslip(teacher, month, year, now)
    };
  });
  const closed = indexes.find((index) =>
    periods.every((period) => periodIndex(period.month, period.year) !== index || period.cutoffPassed)
  );
  slips.push({ key: "all", label: "Cả bảng lương", text: buildTeacherSalaryMessage(teacher, now) });
  return { slips, defaultKey: String(closed ?? indexes[0] ?? "all") };
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
    prisma.expense.groupBy({
      by: ["paymentMethod"],
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

  // Lớp đã lưu trữ tách xuống mục riêng cuối trang cho đỡ rối; mỗi phần tự cộng lại theo giáo viên.
  const lines = ledger.flatMap((teacher) => teacher.classes.flatMap((classRoom) => classRoom.periods));
  const byTeacher = (list: TeacherLedger[]) =>
    selectedTeacher ? list.filter((teacher) => teacherParam(teacher) === selectedTeacher) : list;
  const shown = byTeacher(buildSalaryLedger(lines.filter((line) => !line.archived)));
  const shownArchived = byTeacher(buildSalaryLedger(lines.filter((line) => line.archived)));
  // Chip lọc chỉ cho giáo viên còn lớp đang học, hoặc vẫn còn nợ lương (kể cả lớp đã lưu trữ).
  const chipTeachers = ledger.filter(
    (teacher) => teacher.classes.some((classRoom) => !classRoom.archived) || teacher.owed > 0
  );
  // Phiếu lương lấy mọi lớp của giáo viên trong tháng, kể cả lớp vừa lưu trữ.
  const fullLedger = new Map(ledger.map((teacher) => [teacherParam(teacher), teacher]));
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
          label="Còn thiếu lương GV"
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
          label="Đã trả trong tháng này"
          tone="success"
          value={formatCurrency(paidThisMonth.reduce((sum, row) => sum + (row._sum.amount ?? 0), 0))}
          hint={`CK ${formatCurrency(
            paidThisMonth.filter((row) => row.paymentMethod !== "cash").reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)
          )} · TM ${formatCurrency(
            paidThisMonth.filter((row) => row.paymentMethod === "cash").reduce((sum, row) => sum + (row._sum.amount ?? 0), 0)
          )} (mọi tháng lương)`}
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
          {chipTeachers.map((teacher) => {
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

      {shown.length === 0 && shownArchived.length === 0 ? (
        <EmptyState title="Chưa có lương giáo viên để theo dõi" icon={<Users className="h-6 w-6" />}>
          Khai % lương giáo viên ở Lớp học → Sửa lớp. Khi có học phí đã thu, lương từng tháng sẽ tự hiện ở đây.
        </EmptyState>
      ) : (
        shown.map((teacher) => (
          <TeacherPanel
            key={teacherParam(teacher)}
            teacher={teacher}
            fullTeacher={fullLedger.get(teacherParam(teacher)) ?? teacher}
            currentIndex={currentIndex}
            now={now}
          />
        ))
      )}

      {shownArchived.length > 0 ? (
        <ArchivedSection teachers={shownArchived} fullLedger={fullLedger} currentIndex={currentIndex} now={now} />
      ) : null}
    </div>
  );
}

/** Lương các lớp đã lưu trữ: thu gọn mặc định, tự mở khi còn nợ giáo viên để không bị sót. */
function ArchivedSection({
  teachers,
  fullLedger,
  currentIndex,
  now
}: {
  teachers: TeacherLedger[];
  fullLedger: Map<string, TeacherLedger>;
  currentIndex: number;
  now: Date;
}) {
  const classCount = teachers.reduce((sum, teacher) => sum + teacher.classes.length, 0);
  const owed = teachers.reduce((sum, teacher) => sum + teacher.owed, 0);
  return (
    <details className="group rounded-2xl border border-stone-200/80 bg-stone-50/60 shadow-soft" open={owed > 0}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
        <span className="flex items-center gap-2 font-bold text-stone-700">
          <Archive className="h-5 w-5 text-stone-500" />
          Lớp đã lưu trữ ({classCount} lớp)
        </span>
        <span className="text-xs text-stone-500">
          {owed > 0 ? (
            <span className="font-semibold text-warning">Còn thiếu {formatCurrency(owed)}</span>
          ) : (
            "Đã trả đủ"
          )}{" "}
          <span className="font-semibold text-primary group-open:hidden">· Xem</span>
        </span>
      </summary>
      <div className="grid gap-6 border-t border-stone-200 p-4">
        {teachers.map((teacher) => (
          <TeacherPanel
            key={teacherParam(teacher)}
            teacher={teacher}
            fullTeacher={fullLedger.get(teacherParam(teacher)) ?? teacher}
            currentIndex={currentIndex}
            now={now}
          />
        ))}
      </div>
    </details>
  );
}

function TeacherPanel({
  teacher,
  fullTeacher,
  currentIndex,
  now
}: {
  teacher: TeacherLedger;
  /** Cả lớp đang học lẫn đã lưu trữ của giáo viên, để phiếu lương đủ mọi lớp trong tháng. */
  fullTeacher: TeacherLedger;
  currentIndex: number;
  now: Date;
}) {
  const options = payoutOptions(teacher);
  const payslips = payslipOptions(fullTeacher, now);
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
              <dt className="text-stone-500">Đã trả</dt>
              <dd className="font-semibold text-success">{formatCurrency(teacher.paidOut)}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt className="text-stone-500">Còn thiếu</dt>
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
          <PayslipButton teacherName={teacher.teacherName} slips={payslips.slips} defaultKey={payslips.defaultKey} />
          {options.length > 0 ? (
            <SalaryPayoutButton
              teacherName={teacher.teacherName}
              options={options}
              initialKeys={owedKeys}
              label="Ghi trả lương"
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

function PayoutList({
  payouts,
  className,
  month,
  year
}: {
  payouts: SalaryLine["payouts"];
  className: string;
  month: number;
  year: number;
}) {
  if (payouts.length === 0) return <span className="text-stone-400">—</span>;
  return (
    <ul className="grid gap-1">
      {payouts.map((payout) => (
        <li key={payout.id} className="flex items-start justify-end gap-1">
          <div className="min-w-0 text-right">
            <div className="whitespace-nowrap">
              <span className={`font-semibold ${payout.amount < 0 ? "text-primary" : "text-success"}`}>
                {formatCurrency(payout.amount)}
              </span>
              <span className="ml-1.5 text-xs text-stone-500">{formatDayMonth(payout.paidAt ?? payout.createdAt)}</span>
            </div>
            {payout.note ? <div className="text-xs text-stone-500">{payout.note}</div> : null}
          </div>
          <ConfirmDeleteButton
            id={payout.id}
            action={deleteExpenseAction}
            title="Xóa lần trả này"
            description={
              <>
                Xóa khoản <strong>{formatCurrency(payout.amount)}</strong> (
                {payout.paymentMethod === "cash" ? "tiền mặt" : "chuyển khoản"}) ngày{" "}
                {formatDayMonth(payout.paidAt ?? payout.createdAt)} của {className} T{month}/{year}? Số này sẽ quay lại
                phần còn thiếu của giáo viên.
              </>
            }
          />
        </li>
      ))}
    </ul>
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
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2.5">Tháng lương</th>
              <th className="px-4 py-2.5 text-right">Tổng tháng</th>
              <th className="px-4 py-2.5 text-right">Chuyển khoản</th>
              <th className="px-4 py-2.5 text-right">Tiền mặt</th>
              <th className="px-4 py-2.5 text-right" title="Phần nộp muộn (tính sang lương tháng sau) + phần chưa trả">
                Dư nợ
              </th>
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
                      {period.cutoffFromPayout ? " (theo ngày trả lương)" : period.cutoffOverridden ? " (đặt riêng)" : ""}
                      {period.cutoffPassed ? "" : " (chưa tới)"}
                    </div>
                    <div className="text-xs text-stone-500">
                      {period.mode === "percent"
                        ? `${period.sharePercent}% × ${formatCurrency(period.ownCollected)}${
                            period.carriedInShare > 0 ? ` + nộp muộn ${formatCurrency(period.carriedInShare)}` : ""
                          }`
                        : "nhập tay"}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">
                    {formatCurrency(period.grossDue)}
                  </td>
                  <td className="px-4 py-3">
                    <PayoutList
                      payouts={period.payouts.filter((payout) => payout.paymentMethod !== "cash")}
                      className={classRoom.className}
                      month={period.month}
                      year={period.year}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <PayoutList
                      payouts={period.payouts.filter((payout) => payout.paymentMethod === "cash")}
                      className={classRoom.className}
                      month={period.month}
                      year={period.year}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {period.debt === 0 ? (
                      <span className="text-stone-400">—</span>
                    ) : (
                      <>
                        <div
                          className={`font-bold ${
                            period.writeOff
                              ? "text-stone-400 line-through"
                              : period.debt > 0
                                ? "text-warning"
                                : "text-primary"
                          }`}
                        >
                          {formatCurrency(period.debt)}
                        </div>
                        <div className="text-xs text-stone-500">
                          {period.writeOff
                            ? "đã bỏ qua"
                            : [
                                period.carriedOutShare > 0 ? `muộn ${formatCurrency(period.carriedOutShare)} → tháng sau` : "",
                                period.difference > 0 ? `chưa trả ${formatCurrency(period.difference)}` : "",
                                period.difference < 0 ? `trả dư ${formatCurrency(-period.difference)}` : ""
                              ]
                                .filter(Boolean)
                                .join(" + ")}
                        </div>
                      </>
                    )}
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
                                    : note.tone === "writeOff"
                                      ? "text-stone-500"
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
                    <div className="flex flex-col items-end gap-1">
                      {period.mode === "percent" && period.difference !== 0 ? (
                        <SalaryPayoutButton
                          teacherName={teacherName}
                          options={options}
                          initialKeys={[key]}
                          label={period.difference > 0 ? "Trả" : "Trừ lại"}
                          variant={period.difference > 0 ? "accent" : "secondary"}
                          compact
                        />
                      ) : null}
                      {period.writeOff || (period.mode === "percent" && period.cutoffPassed && period.debt !== 0) ? (
                        <SalaryWriteOffButton
                          classId={classRoom.classId}
                          className={classRoom.className}
                          month={period.month}
                          year={period.year}
                          debt={period.debt}
                          undo={Boolean(period.writeOff)}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-stone-200 bg-stone-50/60 text-sm">
            <tr>
              <td className="px-4 py-2.5 font-semibold text-stone-600">Cộng</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold">
                {formatCurrency(classRoom.periods.reduce((sum, period) => sum + period.grossDue, 0))}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-success">
                {formatCurrency(
                  classRoom.periods.reduce((sum, period) => sum + period.paidBank, 0)
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold text-success">
                {formatCurrency(
                  classRoom.periods.reduce((sum, period) => sum + period.paidCash, 0)
                )}
              </td>
              <td
                className={`whitespace-nowrap px-4 py-2.5 text-right font-bold ${
                  classRoom.owed > 0 ? "text-warning" : "text-stone-400"
                }`}
                title="Tổng phần chưa trả của các tháng (phần nộp muộn đã nằm trong tháng sau)"
              >
                {classRoom.owed > 0 ? `chưa trả ${formatCurrency(classRoom.owed)}` : "—"}
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
