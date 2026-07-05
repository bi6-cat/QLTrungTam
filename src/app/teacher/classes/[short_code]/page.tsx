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

  const classRoom = await prisma.classRoom.findUnique({
    where: { publicToken: short_code },
    include: {
      enrollments: {
        orderBy: { student: { fullName: "asc" } },
        include: {
          student: true,
          invoices: {
            where: { month, year },
            orderBy: { createdAt: "desc" }
          }
        }
      }
    }
  });

  if (!classRoom) {
    notFound();
  }

  const rows = classRoom.enrollments.map((enrollment) => {
    const invoice = enrollment.invoices[0] ?? null;
    const sessions = invoice?.sessions ?? enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
    const amount = invoice?.amount ?? sessions * classRoom.pricePerSession;
    return {
      enrollment,
      invoice,
      sessions,
      amount,
      memo: invoice?.memoContent ?? buildMemo(classRoom.shortCode, enrollment.student.phone, month)
    };
  });

  const paidRows = rows.filter((row) => row.invoice?.status === "paid");
  const unpaidRows = rows.filter((row) => row.invoice?.status !== "paid");
  const expectedAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const paidAmount = paidRows.reduce((sum, row) => sum + row.amount, 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const visibleRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <main className="min-h-screen bg-neutralBg">
      <PublicBrandHeader subtitle="Cổng theo dõi lớp dành cho giáo viên" />
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6">
        <header className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-soft">
          <div className="bg-indigo-50/80 p-6">
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
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Học sinh</p>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">{rows.length}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Đã đóng</p>
              <CheckCircle2 className="h-5 w-5 text-success" />
            </div>
            <p className="mt-2 text-2xl font-bold text-success">{paidRows.length}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Chưa đóng</p>
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <p className="mt-2 text-2xl font-bold text-warning">{unpaidRows.length}</p>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-stone-500">Đã thu</p>
              <CalendarDays className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold text-primary">{formatCurrency(paidAmount)}</p>
            <p className="mt-1 text-xs text-stone-500">Dự kiến {formatCurrency(expectedAmount)}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 p-5">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Theo dõi lớp {formatMonth(month, year)}</h2>
            </div>
            <Badge tone={unpaidRows.length > 0 ? "warning" : "success"}>
              {unpaidRows.length > 0 ? `${unpaidRows.length} chưa đóng` : "Hoàn tất"}
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
                <thead className="bg-stone-50 text-xs uppercase text-stone-500">
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
                    <tr key={row.enrollment.id} className={row.invoice?.status === "paid" ? "bg-emerald-50/30" : ""}>
                      <td className="px-4 py-3">
                        <div className="truncate font-semibold">{row.enrollment.student.fullName}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-stone-600">{row.enrollment.student.phone}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone={row.enrollment.status === "active" ? "primary" : "neutral"}>
                          {row.enrollment.status === "active" ? "Đang học" : "Bảo lưu"}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.sessions}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">{formatCurrency(row.amount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Badge tone={row.invoice?.status === "paid" ? "success" : "warning"}>
                          {row.invoice?.status === "paid" ? "Đã đóng" : row.invoice ? "Chưa đóng" : "Chưa tạo"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <code className="inline-block max-w-full truncate rounded bg-stone-100 px-2 py-1 align-bottom text-xs" title={row.memo}>
                          {row.memo}
                        </code>
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
