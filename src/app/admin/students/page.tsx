import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { createStudentAction, deleteStudentAction } from "@/lib/actions";
import { Badge, Button, EmptyState, Field, Input, Panel, Textarea } from "@/components/ui";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 15;

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const page = Math.max(1, Number(params.page || 1));
  const where = q
    ? {
        OR: [
          { fullName: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { parentName: { contains: q, mode: "insensitive" as const } }
        ]
      }
    : {};
  const [students, total] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        enrollments: { include: { classRoom: true } }
      }
    }),
    prisma.student.count({ where })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(nextPage: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    search.set("page", String(nextPage));
    return `/admin/students?${search.toString()}`;
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutralText">Học sinh</h1>
          <p className="mt-1 text-sm text-stone-600">Quản lý thông tin học sinh và phụ huynh.</p>
        </div>
        <form action="/admin/students" method="GET" className="flex w-full gap-2 sm:w-auto">
          <Input name="q" defaultValue={q} placeholder="Tìm tên, SĐT, phụ huynh" className="sm:w-72" />
          <Button type="submit" variant="secondary">Tìm</Button>
        </form>
      </div>

      <Panel>
        <h2 className="font-bold">Thêm học sinh</h2>
        <form action={createStudentAction} className="mt-4 grid gap-3 lg:grid-cols-4">
          <Field label="Họ tên">
            <Input name="fullName" required />
          </Field>
          <Field label="Số điện thoại">
            <Input name="phone" required />
          </Field>
          <Field label="Phụ huynh">
            <Input name="parentName" />
          </Field>
          <Field label="Địa chỉ">
            <Input name="address" />
          </Field>
          <div className="lg:col-span-4">
            <Field label="Ghi chú">
              <Textarea name="note" />
            </Field>
          </div>
          <div className="lg:col-span-4">
            <Button type="submit">
              <Plus className="h-4 w-4" />
              Thêm học sinh
            </Button>
          </div>
        </form>
      </Panel>

      {students.length === 0 ? (
        <EmptyState title="Chưa có học sinh">Thêm học sinh đầu tiên rồi gán vào lớp tại mục Lớp học.</EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50 text-xs uppercase text-stone-500">
                <tr>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Phụ huynh</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="font-semibold">{student.fullName}</div>
                      <div className="text-xs text-stone-500">{student.address}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{student.parentName || "-"}</td>
                    <td className="px-4 py-3 font-mono">{student.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {student.enrollments.length === 0 ? (
                          <Badge>Chưa gán lớp</Badge>
                        ) : (
                          student.enrollments.map((enrollment) => (
                            <Badge key={enrollment.id} tone={enrollment.status === "active" ? "primary" : "neutral"}>
                              {enrollment.classRoom.shortCode}
                            </Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{student.note || "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={deleteStudentAction}>
                        <input type="hidden" name="id" value={student.id} />
                        <Button type="submit" variant="ghost" className="h-9 w-9 px-0" title="Xóa học sinh">
                          <Trash2 className="h-4 w-4 text-warning" />
                        </Button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4">
            <p className="text-sm text-stone-600">
              Hiển thị {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} / {total} học sinh
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={pageHref(Math.max(1, page - 1))}
                className={`focus-ring inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${
                  page <= 1 ? "pointer-events-none opacity-50" : "bg-white hover:bg-stone-50"
                }`}
              >
                Trước
              </Link>
              <span className="text-sm font-semibold text-stone-600">
                {page}/{totalPages}
              </span>
              <Link
                href={pageHref(Math.min(totalPages, page + 1))}
                className={`focus-ring inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold ${
                  page >= totalPages ? "pointer-events-none opacity-50" : "bg-white hover:bg-stone-50"
                }`}
              >
                Sau
              </Link>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
