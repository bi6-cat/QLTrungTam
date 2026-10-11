import Link from "next/link";
import { Prisma } from "@prisma/client";
import { Archive, ChevronLeft, ChevronRight, Eye, Phone, Search, UserRound, Users, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Panel, PageHeader, Select } from "@/components/ui";
import { AddStudentButton } from "@/components/AddStudentForm";
import { ArchiveEntityButton } from "@/components/ArchiveEntityButton";
import { EditStudentButton } from "@/components/EditStudentButton";
import { StudentExcelImportButton } from "@/components/StudentExcelImportButton";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
/** Giá trị bộ lọc lớp cho học sinh hiện không học lớp nào. */
const NO_CLASS = "none";

// Ghi danh còn hiệu lực: chưa nghỉ và lớp chưa lưu trữ.
const currentEnrollment = { leftAt: null, classRoom: { archivedAt: null } } satisfies Prisma.EnrollmentWhereInput;

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; classId?: string; archived?: string }>;
}) {
  // Quản lý phụ cũng thêm/sửa/lưu trữ được học sinh; nhập Excel (kèm xếp lớp) vẫn chỉ của chủ.
  const viewer = await requireStaff();
  const isOwner = viewer.role === "owner";
  const params = await searchParams;
  const q = (params.q || "").trim();
  const classId = (params.classId || "").trim();
  const parsedPage = Number(params.page);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const showArchived = params.archived === "1";

  const searchFilters: Prisma.StudentWhereInput[] = [];
  if (q) {
    searchFilters.push({
      OR: [
        { fullName: { contains: q, mode: "insensitive" as const } },
        { phone: { contains: q } },
        { parentName: { contains: q, mode: "insensitive" as const } }
      ]
    });
  }
  if (classId === NO_CLASS) {
    searchFilters.push({ enrollments: { none: currentEnrollment } });
  } else if (classId) {
    searchFilters.push({ enrollments: { some: { classId, leftAt: null } } });
  }
  const where: Prisma.StudentWhereInput = {
    AND: [{ archivedAt: showArchived ? { not: null } : null }, ...searchFilters]
  };

  const [total, activeCount, archivedCount, classes] = await Promise.all([
    prisma.student.count({ where }),
    prisma.student.count({ where: { archivedAt: null } }),
    prisma.student.count({ where: { archivedAt: { not: null } } }),
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, shortCode: true }
    })
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const students = await prisma.student.findMany({
    where,
    orderBy: { fullName: "asc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: {
      enrollments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          leftAt: true,
          classRoom: { select: { id: true, name: true, shortCode: true, archivedAt: true } }
        }
      }
    }
  });
  const hasFilter = Boolean(q || classId);
  const selectedClass = classes.find((classRoom) => classRoom.id === classId) ?? null;

  function listHref(changes: { page?: number; archived?: boolean; keepFilters?: boolean }) {
    const search = new URLSearchParams();
    const archived = changes.archived ?? showArchived;
    if (changes.keepFilters !== false) {
      if (q) search.set("q", q);
      if (classId) search.set("classId", classId);
    }
    if (archived) search.set("archived", "1");
    if (changes.page && changes.page > 1) search.set("page", String(changes.page));
    const query = search.toString();
    return query ? `/admin/students?${query}` : "/admin/students";
  }

  const rows = students.map((student) => {
    const current = student.enrollments.filter((enrollment) => !enrollment.leftAt && !enrollment.classRoom.archivedAt);
    return {
      student,
      current,
      pastCount: student.enrollments.length - current.length,
      editable: {
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        address: student.address,
        parentName: student.parentName,
        note: student.note
      }
    };
  });

  const tabs = [
    { label: "Đang học", count: activeCount, archived: false, icon: Users },
    { label: "Đã lưu trữ", count: archivedCount, archived: true, icon: Archive }
  ];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Học sinh"
        description="Hồ sơ học sinh và phụ huynh. Xếp lớp cho học sinh tại mục Lớp học."
        actions={
          <>
            {isOwner ? <StudentExcelImportButton /> : null}
            <AddStudentButton />
          </>
        }
      />

      <Panel className="overflow-hidden p-0">
        <div className="grid gap-4 border-b border-stone-100 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1 sm:w-fit">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.archived === showArchived;
              return (
                <Link
                  key={tab.label}
                  href={listHref({ archived: tab.archived })}
                  className={`focus-ring inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors sm:flex-none ${
                    active ? "bg-white text-primary shadow-sm" : "text-stone-600 hover:text-neutralText"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-indigo-50 text-primary" : "bg-stone-200 text-stone-600"}`}
                  >
                    {tab.count}
                  </span>
                </Link>
              );
            })}
          </div>

          <form action="/admin/students" method="GET" className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
            {showArchived ? <input type="hidden" name="archived" value="1" /> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input name="q" defaultValue={q} placeholder="Tìm theo tên học sinh, SĐT, phụ huynh" className="pl-10" />
            </div>
            <Select name="classId" defaultValue={classId} aria-label="Lọc theo lớp">
              <option value="">Tất cả lớp</option>
              <option value={NO_CLASS}>Chưa vào lớp nào</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              <Search className="h-4 w-4" />
              Lọc
            </Button>
            {hasFilter ? (
              <Link
                href={listHref({ keepFilters: false })}
                className="focus-ring inline-flex h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
                Bỏ lọc
              </Link>
            ) : null}
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title={hasFilter ? "Không tìm thấy học sinh phù hợp" : showArchived ? "Chưa có học sinh lưu trữ" : "Chưa có học sinh"}
              icon={showArchived ? <Archive className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}
            >
              {selectedClass ? (
                <>Không có học sinh nào đang học lớp <strong>{selectedClass.name}</strong> khớp bộ lọc.</>
              ) : hasFilter ? (
                <>Thử từ khóa khác hoặc bỏ bớt bộ lọc.</>
              ) : showArchived ? (
                <>Học sinh được lưu trữ sẽ xuất hiện tại đây và có thể khôi phục bất cứ lúc nào.</>
              ) : (
                <>Bấm &quot;Thêm học sinh&quot; để tạo hồ sơ đầu tiên, sau đó xếp lớp tại mục Lớp học.</>
              )}
            </EmptyState>
          </div>
        ) : (
          <>
            {/* Màn hình nhỏ: dạng thẻ. */}
            <ul className="divide-y divide-stone-100 md:hidden">
              {rows.map(({ student, current, pastCount, editable }) => (
                <li key={student.id} className="grid gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/admin/students/${student.id}`} className="font-semibold text-primary hover:underline">
                        {student.fullName}
                      </Link>
                      <p className="mt-0.5 text-sm text-stone-600">
                        {student.parentName ? `${student.parentName} · ` : ""}
                        <a href={`tel:${student.phone}`} className="font-mono">{student.phone}</a>
                      </p>
                    </div>
                    <RowActions studentId={student.id} archived={Boolean(student.archivedAt)} editable={editable} />
                  </div>
                  <ClassBadges current={current} pastCount={pastCount} />
                  {student.note ? <p className="line-clamp-2 text-xs text-stone-500">{student.note}</p> : null}
                </li>
              ))}
            </ul>

            {/* Màn hình lớn: dạng bảng. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center">#</th>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Phụ huynh · SĐT</th>
                    <th className="px-4 py-3">Lớp đang học</th>
                    <th className="px-4 py-3">Ghi chú</th>
                    <th className="w-36 px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                  {rows.map(({ student, current, pastCount, editable }, index) => (
                    <tr key={student.id} className={student.archivedAt ? "bg-stone-50/70" : undefined}>
                      <td className="px-4 py-3 text-center text-stone-400">{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/students/${student.id}`} className="font-semibold text-primary hover:underline">
                          {student.fullName}
                        </Link>
                        {student.address ? <div className="max-w-56 truncate text-xs text-stone-500">{student.address}</div> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="text-neutralText">{student.parentName || <span className="text-stone-400">Chưa có tên PH</span>}</div>
                        <a
                          href={`tel:${student.phone}`}
                          className="inline-flex items-center gap-1 font-mono text-xs text-stone-600 hover:text-primary"
                        >
                          <Phone className="h-3 w-3" />
                          {student.phone}
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <ClassBadges current={current} pastCount={pastCount} />
                      </td>
                      <td className="px-4 py-3">
                        {student.note ? (
                          <p className="line-clamp-2 max-w-64 text-stone-600" title={student.note}>{student.note}</p>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <RowActions studentId={student.id} archived={Boolean(student.archivedAt)} editable={editable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-5 py-4">
              <p className="text-sm text-stone-600">
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / <strong>{total}</strong> học sinh
              </p>
              {totalPages > 1 ? (
                <div className="flex items-center gap-2">
                  <Link
                    href={listHref({ page: Math.max(1, page - 1) })}
                    aria-disabled={page <= 1}
                    className={`focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold ${
                      page <= 1 ? "pointer-events-none opacity-50" : "hover:bg-stone-50"
                    }`}
                  >
                    <ChevronLeft className="h-4 w-4" /> Trước
                  </Link>
                  <span className="text-sm font-semibold text-stone-600">
                    {page}/{totalPages}
                  </span>
                  <Link
                    href={listHref({ page: Math.min(totalPages, page + 1) })}
                    aria-disabled={page >= totalPages}
                    className={`focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold ${
                      page >= totalPages ? "pointer-events-none opacity-50" : "hover:bg-stone-50"
                    }`}
                  >
                    Sau <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

type CurrentEnrollment = {
  id: string;
  status: "active" | "on_leave";
  classRoom: { id: string; name: string; shortCode: string };
};

function ClassBadges({ current, pastCount }: { current: CurrentEnrollment[]; pastCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {current.length === 0 ? (
        <Badge>Chưa vào lớp</Badge>
      ) : (
        current.map((enrollment) => (
          <Link
            key={enrollment.id}
            href={`/admin/classes?classId=${enrollment.classRoom.id}`}
            title={`${enrollment.classRoom.name}${enrollment.status === "on_leave" ? " · bảo lưu" : ""}`}
            className="focus-ring rounded-full"
          >
            <Badge tone={enrollment.status === "active" ? "primary" : "neutral"}>
              {enrollment.classRoom.shortCode}
              {enrollment.status === "on_leave" ? " · bảo lưu" : ""}
            </Badge>
          </Link>
        ))
      )}
      {pastCount > 0 ? <span className="text-xs text-stone-400">+{pastCount} lớp cũ</span> : null}
    </div>
  );
}

function RowActions({
  studentId,
  archived,
  editable
}: {
  studentId: string;
  archived: boolean;
  editable: React.ComponentProps<typeof EditStudentButton>["student"];
}) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-1">
      <Link
        href={`/admin/students/${studentId}`}
        title="Xem hồ sơ"
        className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-primary"
      >
        <Eye className="h-4 w-4" />
      </Link>
      {!archived ? <EditStudentButton student={editable} /> : null}
      <ArchiveEntityButton kind="student" entityId={studentId} entityName={editable.fullName} archived={archived} compact />
    </div>
  );
}
