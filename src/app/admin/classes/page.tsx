import Link from "next/link";
import { AlertTriangle, Plus } from "lucide-react";
import {
  createClassAction
} from "@/lib/actions";
import { Button, EmptyState, Field, Input, Panel, PageHeader } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { buildMemo } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { ClassInvoiceEditor } from "@/components/ClassInvoiceEditor";
import { CopyParentLinkButton } from "@/components/CopyParentLinkButton";
import { CopyTeacherLinkButton } from "@/components/CopyTeacherLinkButton";
import { DeleteClassButton } from "@/components/DeleteClassButton";
import { EditClassButton } from "@/components/EditClassButton";
import { getAppSettings } from "@/lib/settings";
import { AddStudentToClassButton } from "@/components/AddStudentToClassButton";

export const dynamic = "force-dynamic";

export default async function ClassesPage({
  searchParams
}: {
  searchParams: Promise<{ classId?: string; month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const month = Number(params.month || now.getMonth() + 1);
  const year = Number(params.year || now.getFullYear());
  const [classes, students, settings] = await Promise.all([
    prisma.classRoom.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        enrollments: {
          orderBy: { createdAt: "asc" },
          include: {
            student: true,
            invoices: { where: { month, year }, orderBy: { createdAt: "desc" } }
          }
        }
      }
    }),
    prisma.student.findMany({ orderBy: { fullName: "asc" } }),
    getAppSettings()
  ]);

  const selectedClass =
    classes.find((classRoom) => classRoom.id === params.classId) ?? classes[0] ?? null;
  const duplicatePhones = new Set(
    selectedClass
      ? Object.entries(
          selectedClass.enrollments.reduce<Record<string, number>>((acc, enrollment) => {
            acc[enrollment.student.phone] = (acc[enrollment.student.phone] ?? 0) + 1;
            return acc;
          }, {})
        )
          .filter(([, count]) => count > 1)
          .map(([phone]) => phone)
      : []
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Lớp học"
        description="Quản lý lớp, giáo viên, học sinh trong lớp và hóa đơn theo tháng."
        actions={
          selectedClass ? (
            <>
              <EditClassButton
                classRoom={{
                  id: selectedClass.id,
                  name: selectedClass.name,
                  shortCode: selectedClass.shortCode,
                  teacherName: selectedClass.teacherName,
                  pricePerSession: selectedClass.pricePerSession,
                  sessionsPerMonthDefault: selectedClass.sessionsPerMonthDefault
                }}
              />
              <CopyTeacherLinkButton
                className={selectedClass.name}
                teacherUrl={`${settings.appUrl.replace(/\/$/, "")}/teacher/classes/${selectedClass.publicToken}?month=${month}&year=${year}`}
              />
              <CopyParentLinkButton
                className={selectedClass.name}
                classShortCode={selectedClass.shortCode}
                payUrl={`${settings.appUrl.replace(/\/$/, "")}/pay/${selectedClass.publicToken}`}
              />
            </>
          ) : undefined
        }
      />

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="grid h-fit gap-4">
          <Panel>
            <h2 className="font-bold">Danh sách lớp</h2>
            {classes.length === 0 ? (
              <p className="mt-3 text-sm text-stone-600">Chưa có lớp nào.</p>
            ) : (
              <div className="mt-3 grid gap-2">
                {classes.map((classRoom) => {
                  const isSelected = selectedClass?.id === classRoom.id;
                  return (
                    <div
                      key={classRoom.id}
                      className={[
                        "relative flex items-center justify-between gap-3 rounded-xl border p-3 transition-all duration-150",
                        isSelected
                          ? "border-indigo-200 bg-indigo-50 shadow-sm"
                          : "border-stone-200 bg-white hover:border-indigo-300 hover:bg-stone-50"
                      ].join(" ")}
                    >
                      {isSelected ? (
                        <span className="absolute left-0 top-3 h-10 w-1 rounded-r-full bg-accent" />
                      ) : null}
                    <Link
                      href={`/admin/classes?classId=${classRoom.id}&month=${month}&year=${year}`}
                      className="min-w-0 flex-1 pl-1"
                    >
                      <p className="truncate font-semibold">{classRoom.name}</p>
                      <p className="truncate text-xs text-stone-500">
                        {classRoom.shortCode}
                        {classRoom.teacherName ? ` · ${classRoom.teacherName}` : ""}
                      </p>
                      {isSelected ? (
                        <span className="mt-2 inline-flex rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-primary ring-1 ring-indigo-100">
                          Đang xem
                        </span>
                      ) : null}
                    </Link>
                    <DeleteClassButton classId={classRoom.id} className={classRoom.name} />
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel>
            <h2 className="font-bold">Tạo lớp mới</h2>
            <form action={createClassAction} className="mt-4 grid gap-3">
              <Field label="Tên lớp">
                <Input name="name" required placeholder="Lớp 10A - Toán" />
              </Field>
              <Field label="Mã lớp">
                <Input name="shortCode" required placeholder="L10A" />
              </Field>
              <Field label="Tên giáo viên">
                <Input name="teacherName" placeholder="Cô Hạnh" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Giá / buổi">
                  <Input name="pricePerSession" type="number" min="0" required />
                </Field>
                <Field label="Buổi / tháng">
                  <Input name="sessionsPerMonthDefault" type="number" min="1" defaultValue="8" required />
                </Field>
              </div>
              <Button type="submit">
                <Plus className="h-4 w-4" />
                Tạo lớp
              </Button>
            </form>
          </Panel>
        </div>

        {selectedClass ? (
          <section className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-soft">
            <div className="border-b border-indigo-100 bg-indigo-50/70 p-6">
              <div className="flex flex-wrap items-end justify-between gap-5">
                <div>
                  <p className="text-xs font-bold uppercase text-primary">Chi tiết lớp</p>
                  <h2 className="mt-1 text-2xl font-bold">{selectedClass.name}</h2>
                  <p className="mt-2 text-sm text-stone-600">
                    {selectedClass.shortCode}
                    {selectedClass.teacherName ? ` · GV: ${selectedClass.teacherName}` : ""} ·{" "}
                    {formatCurrency(selectedClass.pricePerSession)} / buổi ·{" "}
                    {selectedClass.sessionsPerMonthDefault} buổi mặc định
                  </p>
                </div>
                <form action="/admin/classes" method="GET" className="grid gap-2 sm:grid-cols-[110px_140px_auto]">
                  <input type="hidden" name="classId" value={selectedClass.id} />
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

              {duplicatePhones.size > 0 ? (
                <div className="mt-4 flex gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  Có số điện thoại trùng trong lớp: {Array.from(duplicatePhones).join(", ")}. Memo có thể trùng,
                  cần xử lý thủ công trước khi thu.
                </div>
              ) : null}
            </div>

            <div className="p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-bold">Học sinh trong lớp</h3>
                <AddStudentToClassButton
                  classId={selectedClass.id}
                  students={students.map((student) => ({
                    id: student.id,
                    fullName: student.fullName,
                    phone: student.phone
                  }))}
                />
              </div>
              {selectedClass.enrollments.length === 0 ? (
                <EmptyState title="Lớp chưa có học sinh">Thêm học sinh vào lớp để bắt đầu tạo hóa đơn.</EmptyState>
              ) : (
                <ClassInvoiceEditor
                  classId={selectedClass.id}
                  month={month}
                  year={year}
                  rows={selectedClass.enrollments.map((enrollment) => {
                    const invoice = enrollment.invoices[0];
                    const defaultSessions =
                      enrollment.sessionsOverride ?? selectedClass.sessionsPerMonthDefault;
                    return {
                      enrollmentId: enrollment.id,
                      studentName: enrollment.student.fullName,
                      phone: enrollment.student.phone,
                      enrollmentStatus: enrollment.status,
                      defaultSessions,
                      pricePerSession: selectedClass.pricePerSession,
                      memoContent: buildMemo(selectedClass.shortCode, enrollment.student.phone, month, year),
                      invoice: invoice
                        ? {
                            id: invoice.id,
                            month: invoice.month,
                            year: invoice.year,
                            sessions: invoice.sessions,
                            pricePerSession: invoice.pricePerSession,
                            amount: invoice.amount,
                            memoContent: invoice.memoContent,
                            status: invoice.status
                          }
                        : null
                    };
                  })}
                />
              )}
            </div>
          </section>
        ) : (
          <EmptyState title="Chưa có lớp học nào">Tạo lớp đầu tiên để bắt đầu quản lý học phí.</EmptyState>
        )}
      </div>
    </div>
  );
}
