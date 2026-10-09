import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { ClassSessionsEditor } from "@/components/ClassSessionsEditor";
import { MonthSwitcher } from "@/components/MonthSwitcher";
import { requireStaff } from "@/lib/auth";
import {
  enrollmentVisibleInPeriodWhere,
  latestMonthUpToPeriodArgs,
  remainingScheduledSessions,
  resolveMonthPlan
} from "@/lib/enrollment-period";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Mục "Lớp học" của quản lý phụ: chỉ xem lớp, nhập số buổi và ghi chú theo tháng. Không tạo hóa
 * đơn, không thêm/sửa/xóa lớp, học sinh, bảo lưu hay đổi trạng thái hóa đơn.
 */
export default async function ClassSessionsPage({
  searchParams
}: {
  searchParams: Promise<{ classId?: string; month?: string; year?: string }>;
}) {
  await requireStaff();
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

  const classes = await prisma.classRoom.findMany({
    where: { archivedAt: null },
    orderBy: { createdAt: "asc" },
    include: {
      schedules: { select: { weekday: true } },
      enrollments: {
        where: enrollmentVisibleInPeriodWhere(month, year),
        orderBy: { student: { fullName: "asc" } },
        include: {
          student: {
            include: {
              // Các lớp học sinh đang theo học (chưa nghỉ, lớp chưa lưu trữ).
              enrollments: {
                where: { leftAt: null, classRoom: { archivedAt: null } },
                orderBy: { classRoom: { name: "asc" } },
                select: { classRoom: { select: { id: true, name: true } } }
              }
            }
          },
          invoices: { where: { month, year }, orderBy: { createdAt: "desc" } },
          months: latestMonthUpToPeriodArgs(month, year)
        }
      }
    }
  });

  const classRows = classes.map((classRoom) => {
    const rows = classRoom.enrollments.map((enrollment) => {
      const invoice = enrollment.invoices[0];
      const plan = resolveMonthPlan({
        month,
        year,
        latestMonth: enrollment.months[0],
        invoice,
        enrollment,
        classRoom
      });
      const studentArchived = Boolean(enrollment.student.archivedAt);
      const currentMonth = enrollment.months[0];
      const remainingSessions = plan.initialized
        ? null
        : remainingScheduledSessions(classRoom.schedules, enrollment.startDate, month, year);
      return {
        enrollmentId: enrollment.id,
        studentName: invoice?.studentNameSnapshot ?? enrollment.student.fullName,
        phone: invoice?.studentPhoneSnapshot ?? enrollment.student.phone,
        monthlyStatus: plan.status,
        studentArchived,
        // Cùng điều kiện với server action: chỉ học sinh đang học, chưa có hóa đơn hoặc hóa đơn chưa đóng.
        editable:
          !studentArchived && plan.status === "active" && (!invoice || invoice.status === "unpaid"),
        sessions: plan.sessions,
        // months[0] có thể là tháng trước (để kế thừa trạng thái): ghi chú chỉ lấy của đúng kỳ.
        note: currentMonth?.month === month && currentMonth.year === year ? currentMonth.note ?? "" : "",
        enrolledClasses: enrollment.student.enrollments.map((item) => ({
          name: item.classRoom.name,
          current: item.classRoom.id === classRoom.id
        })),
        pricePerSession: plan.pricePerSession,
        joinHint:
          plan.status === "active" && remainingSessions !== null && remainingSessions < plan.defaultSessions
            ? {
                joinedOn: `${enrollment.startDate.getDate()}/${enrollment.startDate.getMonth() + 1}`,
                sessions: remainingSessions
              }
            : null,
        invoice: invoice ? { status: invoice.status, amount: invoice.amount } : null
      };
    });
    return { classRoom, rows };
  });

  const selected = classRows.find((item) => item.classRoom.id === params.classId) ?? classRows[0] ?? null;
  const classHref = (classId: string) => `/admin/class-sessions?classId=${classId}&month=${month}&year=${year}`;

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Lớp học"
        description="Chọn lớp và tháng, nhập số buổi học và ghi chú của từng học sinh rồi lưu."
        actions={
          <MonthSwitcher
            basePath="/admin/class-sessions"
            month={month}
            year={year}
            params={{ classId: selected?.classRoom.id }}
          />
        }
      />

      {classRows.length === 0 ? (
        <EmptyState title="Chưa có lớp học nào">Chủ trung tâm chưa tạo lớp đang hoạt động.</EmptyState>
      ) : (
        <>
          {/* Cuộn ngang trên điện thoại, xuống dòng trên màn hình rộng. */}
          <nav aria-label="Chọn lớp" className="-mx-4 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
            <div className="flex w-max gap-2 lg:w-auto lg:flex-wrap">
              {classRows.map(({ classRoom }) => {
                const active = classRoom.id === selected?.classRoom.id;
                return (
                  <Link
                    key={classRoom.id}
                    href={classHref(classRoom.id)}
                    aria-current={active ? "page" : undefined}
                    className={`focus-ring inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors ${
                      active ? "bg-primary text-white ring-primary" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {classRoom.name}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        active ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600"
                      }`}
                      title="Số học sinh trong tháng"
                    >
                      {classRoom.enrollments.length}
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {selected ? (
            <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
              <div className="border-b border-indigo-100 bg-indigo-50/70 px-4 py-4 sm:px-6">
                <h2 className="text-xl font-bold">{selected.classRoom.name}</h2>
                <p className="mt-1 text-sm text-stone-600">
                  {selected.classRoom.shortCode}
                  {selected.classRoom.teacherName ? ` · GV: ${selected.classRoom.teacherName}` : ""} ·{" "}
                  {formatCurrency(selected.classRoom.pricePerSession)} / buổi ·{" "}
                  {selected.classRoom.sessionsPerMonthDefault} buổi mặc định
                </p>
              </div>
              {selected.rows.length === 0 ? (
                <div className="p-5">
                  <EmptyState title="Lớp chưa có học sinh">Chưa có học sinh nào học lớp này trong tháng.</EmptyState>
                </div>
              ) : (
                <ClassSessionsEditor
                  // Đổi lớp/tháng thì bỏ bản nháp số buổi đang gõ dở.
                  key={`${selected.classRoom.id}-${month}-${year}`}
                  classId={selected.classRoom.id}
                  month={month}
                  year={year}
                  rows={selected.rows}
                />
              )}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
