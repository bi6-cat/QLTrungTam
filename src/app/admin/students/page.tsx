import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import { createStudentAction, deleteStudentAction } from "@/lib/actions";
import { Badge, Button, EmptyState, Field, Input, Panel, PageHeader, Select, Textarea } from "@/components/ui";
import { EditStudentButton } from "@/components/EditStudentButton";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 15;

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; classId?: string }>;
}) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const classId = (params.classId || "").trim();
  const page = Math.max(1, Number(params.page || 1));
  const filters: Prisma.StudentWhereInput[] = [];
  if (q) {
    filters.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q } },
        { parentName: { contains: q, mode: "insensitive" as const } }
      ]
    });
  }
  if (classId) {
    filters.push({ enrollments: { some: { classId } } });
  }
  const where = filters.length ? { AND: filters } : {};
  const [students, total, classes] = await Promise.all([
    prisma.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        enrollments: { include: { classRoom: true } }
      }
    }),
    prisma.student.count({ where }),
    prisma.classRoom.findMany({ orderBy: { name: "asc" } })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selectedClass = classes.find((classRoom) => classRoom.id === classId) ?? null;

  function pageHref(nextPage: number) {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (classId) search.set("classId", classId);
    search.set("page", String(nextPage));
    return `/admin/students?${search.toString()}`;
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Học sinh"
        description="Quản lý thông tin học sinh và phụ huynh."
        actions={
          <form action="/admin/students" method="GET" className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Input name="q" defaultValue={q} placeholder="Tìm tên, SĐT, phụ huynh" className="sm:w-64" />
            <Select name="classId" defaultValue={classId} className="sm:w-48">
              <option value="">Tất cả lớp</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">Tìm</Button>
          </form>
        }
      />

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
        <EmptyState title={q || classId ? "Không tìm thấy học sinh phù hợp" : "Chưa có học sinh"} icon={<Plus className="h-6 w-6" />}>
          {selectedClass ? (
            <>Không có học sinh nào trong lớp <strong>{selectedClass.name}</strong> khớp bộ lọc hiện tại.</>
          ) : q ? (
            <>Thử từ khóa khác hoặc bỏ bớt bộ lọc.</>
          ) : (
            <>Thêm học sinh đầu tiên rồi gán vào lớp tại mục Lớp học.</>
          )}
        </EmptyState>
      ) : (
        <Panel className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Học sinh</th>
                  <th className="px-4 py-3">Phụ huynh</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
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
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <EditStudentButton
                          student={{
                            id: student.id,
                            fullName: student.fullName,
                            phone: student.phone,
                            address: student.address,
                            parentName: student.parentName,
                            note: student.note
                          }}
                        />
                        <form action={deleteStudentAction}>
                          <input type="hidden" name="id" value={student.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            className="h-9 w-9 px-0 text-warning hover:bg-rose-50"
                            title="Xóa học sinh"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </form>
                      </div>
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
