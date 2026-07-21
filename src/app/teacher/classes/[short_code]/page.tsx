import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock, GraduationCap, Users } from "lucide-react";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { Badge, Button, EmptyState, Field, Input } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { buildMemo } from "@/lib/payment";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 30;

export default async function TeacherClassPage({
  params,
  searchParams
}: {
  params: Promise<{ short_code: string }>;
  searchParams: Promise<{ month?: string; year?: string; page?: string }>;
}) {
  const { short_code } = await params;
  const query = await searchParams;
  const now = new Date();
  const month = Math.min(12, Math.max(1, Number(query.month) || now.getMonth() + 1));
  const year = Number(query.year) || now.getFullYear();
  const requestedPage = Math.max(1, Number(query.page) || 1);
  const periodEnd = new Date(year, month, 1);
  const isPastPeriod = year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1);

  const classRoom = await prisma.classRoom.findUnique({
    where: { publicToken: short_code },
    include: {
      enrollments: {
        where: {
          OR: [
            { createdAt: { lt: periodEnd } },
            { months: { some: { month, year } } },
            { invoices: { some: { month, year } } }
          ]
        },
        orderBy: { student: { fullName: "asc" } },
        include: {
          student: true,
          invoices: {
            where: { month, year },
            orderBy: { createdAt: "desc" }
          },
          months: { where: { month, year }, take: 1 }
        }
      }
    }
  });

  if (!classRoom) {
    notFound();
  }

  const rows = classRoom.enrollments.map((enrollment) => {
    const invoice = enrollment.invoices[0] ?? null;
    const period = enrollment.months[0] ?? null;
    const periodInitialized = Boolean(period || invoice);
    const monthlyStatus = period?.status ?? (invoice ? "active" : isPastPeriod ? null : enrollment.status);
    const sessions = invoice?.sessions ?? period?.sessions ?? (monthlyStatus ? enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault : 0);
    const pricePerSession = invoice?.pricePerSession ?? period?.pricePerSession ?? classRoom.pricePerSession;
    const amount = invoice?.amount ?? (monthlyStatus === "active" ? sessions * pricePerSession : 0);
    return {
      enrollment,
      invoice,
      monthlyStatus,
      periodInitialized,
      sessions,
      amount,
      studentName: invoice?.studentNameSnapshot ?? enrollment.student.fullName,
      studentPhone: invoice?.studentPhoneSnapshot ?? enrollment.student.phone,
      memo: invoice?.memoContent ?? buildMemo(classRoom.shortCode, enrollment.student.phone, month, year)
    };
  });

  const paidRows = rows.filter((row) => row.invoice?.status === "paid");
  const unpaidRows = rows.filter((row) => row.invoice?.status === "unpaid");
  const unissuedRows = rows.filter((row) => !row.invoice && row.monthlyStatus === "active");
  const uninitializedRows = rows.filter((row) => !row.periodInitialized && row.monthlyStatus === null);
  const activeRows = rows.filter((row) => row.monthlyStatus === "active");
  const expectedAmount = activeRows.reduce((sum, row) => sum + row.amount, 0);
  const paidAmount = paidRows.reduce((sum, row) => sum + row.amount, 0);
  const collectibleAmount = [...paidRows, ...unpaidRows].reduce((sum, row) => sum + row.amount, 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <main className="min-h-screen">
      <PublicBrandHeader subtitle="Cổng theo dõi lớp dành cho giáo viên" />
      <div className="mx-auto grid max-w-6xl animate-fade-up gap-5 px-4 py-6">
        <header className="overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-soft">
          <div className="border-b border-indigo-100 bg-indigo-50/80 p-6">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase text-primary">APLUS ACADEMY</p>
                <h1 className="mt-1 text-2xl font-bold text-neutralText">{classRoom.name}</h1>
                <p className="mt-2 text-sm text-stone-600">
                  {classRoom.shortCode}
                  {classRoom.teacherName ? ` · GV: ${classRoom.teacherName}` : ""} ·{" "}
                  {formatCurrency(classRoom.pricePerSession)} / buổi ·{" "}
                  {classRoom.sessionsPerMonthDefault} buổi mặc định
                </p>
              </div>
              <form action={`/teacher/classes/${classRoom.publicToken}`} method="GET" className="grid gap-2 sm:grid-cols-[110px_140px_auto]">
                <Field label="Tháng">
                  <Input name="month" type="number" min="1" max="12" defaultValue={month} />
                </Field>
                <Field label="Năm">
                  <Input name="year" type="number" min="2020" defaultValue={year} />
                </Field>
                <Button type="submit" variant="secondary" className="self-end">
                  Xem tháng
                </Button>
              </form>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Học sinh</p>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">{activeRows.length}</p>
            <p className="mt-1 text-xs text-stone-500">
              Đang học trong tháng{uninitializedRows.length > 0 ? ` · ${uninitializedRows.length} chưa khởi tạo` : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Đã đóng</p>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <p className="mt-2 text-2xl font-bold text-success">{paidRows.length}</p>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Chưa đóng</p>
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <p className="mt-2 text-2xl font-bold text-warning">{unpaidRows.length}</p>
            {unissuedRows.length > 0 ? (
              <p className="mt-1 text-xs text-stone-500">{unissuedRows.length} chưa phát hành hóa đơn</p>
            ) : null}
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Đã thu</p>
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold text-primary">{formatCurrency(paidAmount)}</p>
            <p className="mt-1 text-xs text-stone-500">
              Đã phát hành {formatCurrency(collectibleAmount)} · Kế hoạch {formatCurrency(expectedAmount)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 p-5">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Theo dõi lớp {formatMonth(month, year)}</h2>
            </div>
            <Badge tone={unpaidRows.length > 0 || unissuedRows.length > 0 || uninitializedRows.length > 0 ? "warning" : "success"}>
              {unpaidRows.length > 0
                ? `${unpaidRows.length} chưa đóng${unissuedRows.length > 0 ? ` · ${unissuedRows.length} chưa tạo` : ""}`
                : unissuedRows.length > 0
                  ? `${unissuedRows.length} chưa tạo hóa đơn`
                  : uninitializedRows.length > 0
                    ? `${uninitializedRows.length} chưa khởi tạo tháng`
                  : "Không còn khoản cần xử lý"}
            </Badge>
          </div>

          {rows.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Lớp chưa có học sinh">Khi trung tâm thêm học sinh vào lớp, danh sách sẽ hiển thị tại đây.</EmptyState>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[10%]" />
                  <col className="w-[14%]" />
                  <col className="w-[11%]" />
                  <col className="w-[18%]" />
                </colgroup>
                <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">SĐT</th>
                    <th className="px-4 py-3">Trạng thái học</th>
                    <th className="px-4 py-3">Số buổi</th>
                    <th className="px-4 py-3">Học phí</th>
                    <th className="px-4 py-3">Đóng tiền</th>
                    <th className="px-4 py-3">Memo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {visibleRows.map((row) => (
                    <tr
                      key={row.enrollment.id}
                      className={
                        row.invoice?.status === "paid"
                          ? "bg-emerald-50/30 transition-colors hover:bg-emerald-50/60"
                          : "transition-colors hover:bg-indigo-50/40"
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="truncate font-semibold">{row.studentName}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-600">{row.studentPhone}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone={row.monthlyStatus === "active" ? "primary" : "neutral"}>
                          {row.monthlyStatus === "active"
                            ? "Đang học"
                            : row.monthlyStatus === "on_leave"
                              ? "Bảo lưu"
                              : "Chưa khởi tạo"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.monthlyStatus ? row.sessions : "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">
                        {row.invoice || row.monthlyStatus ? formatCurrency(row.amount) : "-"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge
                          tone={
                            row.invoice?.status === "paid"
                              ? "success"
                              : row.invoice?.status === "unpaid"
                                ? "warning"
                                : row.invoice?.status === "waived"
                                  ? "primary"
                                  : "neutral"
                          }
                        >
                          {row.invoice?.status === "paid"
                            ? "Đã đóng"
                            : row.invoice?.status === "unpaid"
                              ? "Chưa đóng"
                              : row.invoice?.status === "waived"
                                ? "Đã miễn"
                                : row.invoice?.status === "void"
                                  ? "Đã hủy"
                                  : row.monthlyStatus === "active"
                                    ? "Chưa tạo"
                                    : row.monthlyStatus === "on_leave"
                                      ? "Không thu"
                                      : "Chưa khởi tạo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {row.invoice || row.monthlyStatus ? (
                          <code className="inline-block max-w-full truncate rounded bg-stone-100 px-2 py-1 align-bottom text-xs" title={row.memo}>
                            {row.memo}
                          </code>
                        ) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4">
              <p className="text-sm text-stone-600">
                Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, rows.length)} /{" "}
                {rows.length} học sinh
              </p>
              <div className="flex items-center gap-2">
                <Link
                  href={`/teacher/classes/${classRoom.publicToken}?month=${month}&year=${year}&page=${Math.max(1, currentPage - 1)}`}
                  className={[
                    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold shadow-sm",
                    currentPage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-stone-50"
                  ].join(" ")}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Link>
                <span className="text-sm font-semibold text-stone-600">
                  {currentPage}/{totalPages}
                </span>
                <Link
                  href={`/teacher/classes/${classRoom.publicToken}?month=${month}&year=${year}&page=${Math.min(totalPages, currentPage + 1)}`}
                  className={[
                    "inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-semibold shadow-sm",
                    currentPage >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-stone-50"
                  ].join(" ")}
                >
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
