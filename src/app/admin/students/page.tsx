import Link from "next/link";
import { Prisma } from "@prisma/client";
import { AlertCircle, Archive, Eye, Phone, Search, Sparkles, UserMinus, UserRound, Users, X } from "lucide-react";
import { Badge, Button, EmptyState, Input, Panel, PageHeader, Select, StatCard } from "@/components/ui";
import { AddStudentButton } from "@/components/AddStudentForm";
import { ArchiveEntityButton } from "@/components/ArchiveEntityButton";
import { EditStudentButton } from "@/components/EditStudentButton";
import { StudentExcelImportButton } from "@/components/StudentExcelImportButton";
import { Pagination } from "@/components/Pagination";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { matchesName, sortByGivenName } from "@/lib/student-search";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;
/** Giá trị bộ lọc lớp cho học sinh hiện không học lớp nào. */
const NO_CLASS = "none";
const NEW_DAYS = 30;

// Ghi danh còn hiệu lực: chưa nghỉ và lớp chưa lưu trữ.
const currentEnrollment = { leftAt: null, classRoom: { archivedAt: null } } satisfies Prisma.EnrollmentWhereInput;
const hasDebt = {
  enrollments: { some: { invoices: { some: { status: "unpaid" } } } }
} satisfies Prisma.StudentWhereInput;

const QUICK_FILTERS = [
  { key: "", label: "Tất cả" },
  { key: "debt", label: "Còn nợ" },
  { key: "no_class", label: "Chưa vào lớp" },
  { key: "on_leave", label: "Đang bảo lưu" },
  { key: "new", label: `Mới ${NEW_DAYS} ngày` }
] as const;
type QuickFilter = (typeof QUICK_FILTERS)[number]["key"];

function quickFilterWhere(filter: QuickFilter, newSince: Date): Prisma.StudentWhereInput | null {
  switch (filter) {
    case "debt":
      return hasDebt;
    case "no_class":
      return { enrollments: { none: currentEnrollment } };
    case "on_leave":
      return { enrollments: { some: { ...currentEnrollment, status: "on_leave" } } };
    case "new":
      return { createdAt: { gte: newSince } };
    default:
      return null;
  }
}

/** Tên học sinh/phụ huynh gõ không dấu, hoặc một đoạn SĐT. */
function matchesQuery(student: { fullName: string; parentName: string | null; phone: string }, query: string) {
  const digits = query.replace(/[\s.-]/g, "");
  if (/^\d+$/.test(digits)) return student.phone.replace(/\D/g, "").includes(digits);
  return matchesName(student.fullName, query) || Boolean(student.parentName && matchesName(student.parentName, query));
}

export default async function StudentsPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; page?: string; classId?: string; archived?: string; status?: string }>;
}) {
  // Quản lý phụ cũng thêm/sửa/lưu trữ được học sinh; nhập Excel (kèm xếp lớp) vẫn chỉ của chủ.
  const viewer = await requireStaff();
  const isOwner = viewer.role === "owner";
  const params = await searchParams;
  const q = (params.q || "").trim();
  const classId = (params.classId || "").trim();
  const status: QuickFilter = QUICK_FILTERS.find((item) => item.key === params.status)?.key ?? "";
  const parsedPage = Number(params.page);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;
  const showArchived = params.archived === "1";
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const newSince = new Date(now.getTime() - NEW_DAYS * 24 * 60 * 60 * 1000);

  const filters: Prisma.StudentWhereInput[] = [];
  if (classId === NO_CLASS) {
    filters.push({ enrollments: { none: currentEnrollment } });
  } else if (classId) {
    filters.push({ enrollments: { some: { classId, leftAt: null } } });
  }
  const quickWhere = quickFilterWhere(status, newSince);
  if (quickWhere) filters.push(quickWhere);
  const where: Prisma.StudentWhereInput = {
    AND: [{ archivedAt: showArchived ? { not: null } : null }, ...filters]
  };

  // Tìm không dấu và xếp theo tên (chữ cuối) đều làm trong app: lấy thông tin gọn của mọi học sinh
  // khớp bộ lọc, lọc theo từ khóa, xếp rồi mới cắt trang.
  const [candidates, activeCount, archivedCount, classes, stats] = await Promise.all([
    prisma.student.findMany({ where, select: { id: true, fullName: true, phone: true, parentName: true } }),
    prisma.student.count({ where: { archivedAt: null } }),
    prisma.student.count({ where: { archivedAt: { not: null } } }),
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, shortCode: true }
    }),
    showArchived
      ? null
      : Promise.all([
          prisma.student.count({
            where: { archivedAt: null, enrollments: { some: { ...currentEnrollment, status: "active" } } }
          }),
          prisma.student.count({ where: { archivedAt: null, enrollments: { none: currentEnrollment } } }),
          prisma.student.count({ where: { archivedAt: null, ...hasDebt } }),
          prisma.monthlyInvoice.aggregate({
            where: { status: "unpaid", enrollment: { student: { archivedAt: null } } },
            _sum: { amount: true }
          }),
          prisma.student.count({ where: { archivedAt: null, createdAt: { gte: newSince } } })
        ])
  ]);
  const matching = q ? candidates.filter((student) => matchesQuery(student, q)) : candidates;
  const total = matching.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const pageIds = sortByGivenName(matching)
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((student) => student.id);
  const pageStudents = await prisma.student.findMany({
    where: { id: { in: pageIds } },
    include: {
      enrollments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          leftAt: true,
          classRoom: { select: { id: true, name: true, shortCode: true, archivedAt: true } },
          invoices: {
            where: { OR: [{ status: "unpaid" }, { month, year }] },
            select: { month: true, year: true, status: true, amount: true }
          }
        }
      }
    }
  });
  const byId = new Map(pageStudents.map((student) => [student.id, student]));
  const students = pageIds.flatMap((id) => {
    const student = byId.get(id);
    return student ? [student] : [];
  });
  const hasFilter = Boolean(q || classId || status);
  const selectedClass = classes.find((classRoom) => classRoom.id === classId) ?? null;

  function listHref(changes: { page?: number; archived?: boolean; keepFilters?: boolean; status?: QuickFilter }) {
    const search = new URLSearchParams();
    const archived = changes.archived ?? showArchived;
    if (changes.keepFilters !== false) {
      if (q) search.set("q", q);
      if (classId) search.set("classId", classId);
      const nextStatus = changes.status ?? status;
      if (nextStatus) search.set("status", nextStatus);
    }
    if (archived) search.set("archived", "1");
    if (changes.page && changes.page > 1) search.set("page", String(changes.page));
    const query = search.toString();
    return query ? `/admin/students?${query}` : "/admin/students";
  }

  const rows = students.map((student) => {
    const current: CurrentEnrollment[] = student.enrollments
      .filter((enrollment) => !enrollment.leftAt && !enrollment.classRoom.archivedAt)
      .map((enrollment) => ({
        id: enrollment.id,
        status: enrollment.status,
        classRoom: enrollment.classRoom,
        thisMonth:
          enrollment.invoices.find((invoice) => invoice.month === month && invoice.year === year)?.status ?? null
      }));
    const unpaid = student.enrollments.flatMap((enrollment) =>
      enrollment.invoices.filter((invoice) => invoice.status === "unpaid")
    );
    return {
      student,
      current,
      pastCount: student.enrollments.length - current.length,
      debt: { amount: unpaid.reduce((sum, invoice) => sum + invoice.amount, 0), count: unpaid.length },
      isNew: student.createdAt >= newSince,
      editable: {
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        address: student.address,
        parentName: student.parentName,
        birthYear: student.birthYear,
        note: student.note
      }
    };
  });

  const tabs = [
    { label: "Hồ sơ", count: activeCount, archived: false, icon: Users },
    { label: "Đã lưu trữ", count: archivedCount, archived: true, icon: Archive }
  ];
  const [studyingCount, noClassCount, debtorCount, debtSum, newCount] = stats ?? [0, 0, 0, null, 0];

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Học sinh"
        description="Hồ sơ học sinh, phụ huynh, lớp đang học và tình hình học phí. Xếp lớp tại mục Lớp học."
        actions={
          <>
            {isOwner ? <StudentExcelImportButton /> : null}
            <AddStudentButton />
          </>
        }
      />

      {!showArchived ? (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <Link href="/admin/students" className="focus-ring rounded-2xl">
            <StatCard
              label="Đang đi học"
              tone="primary"
              value={studyingCount}
              hint={`Trên ${activeCount} hồ sơ`}
              icon={<Users className="h-5 w-5" />}
            />
          </Link>
          <Link href="/admin/students?status=debt" className="focus-ring rounded-2xl">
            <StatCard
              label="Còn nợ học phí"
              tone={debtorCount > 0 ? "warning" : "success"}
              value={debtorCount}
              hint={debtorCount > 0 ? `Tổng ${formatCurrency(debtSum?._sum.amount ?? 0)}` : "Không ai còn nợ"}
              icon={<AlertCircle className="h-5 w-5" />}
            />
          </Link>
          <Link href="/admin/students?status=no_class" className="focus-ring rounded-2xl">
            <StatCard
              label="Chưa vào lớp"
              tone="neutral"
              value={noClassCount}
              hint="Chưa học lớp nào đang mở"
              icon={<UserMinus className="h-5 w-5" />}
            />
          </Link>
          <Link href="/admin/students?status=new" className="focus-ring rounded-2xl">
            <StatCard
              label={`Mới ${NEW_DAYS} ngày`}
              tone="success"
              value={newCount}
              hint="Hồ sơ vừa thêm"
              icon={<Sparkles className="h-5 w-5" />}
            />
          </Link>
        </div>
      ) : null}

      <Panel className="overflow-hidden p-0">
        <div className="grid gap-3 border-b border-stone-100 p-4 sm:p-5">
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
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <Input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Tên học sinh, phụ huynh hoặc SĐT (gõ không dấu được)"
                className="pl-10"
              />
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
              Tìm
            </Button>
            {hasFilter ? (
              <Link
                href={listHref({ keepFilters: false })}
                className="focus-ring inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-stone-600 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
                Bỏ lọc
              </Link>
            ) : null}
          </form>

          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lọc nhanh">
            {QUICK_FILTERS.map((item) => {
              const active = item.key === status;
              return (
                <Link
                  key={item.key || "all"}
                  href={listHref({ status: item.key })}
                  aria-current={active ? "true" : undefined}
                  className={`focus-ring inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors ${
                    active ? "bg-primary text-white ring-primary" : "bg-white text-stone-600 ring-stone-300 hover:bg-stone-50"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <span className="ml-auto hidden items-center gap-3 text-[11px] text-stone-500 lg:inline-flex">
              <span className="font-semibold">Học phí T{month}:</span>
              <LegendDot className="bg-success" label="Đã đóng" />
              <LegendDot className="bg-warning" label="Chưa đóng" />
              <LegendDot className="bg-stone-300" label="Chưa tạo HĐ" />
            </span>
          </div>
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
              {rows.map(({ student, current, pastCount, debt, isNew, editable }, index) => (
                <li key={student.id} className="grid gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="mr-1.5 text-xs font-semibold tabular-nums text-stone-400">
                        {(page - 1) * PAGE_SIZE + index + 1}.
                      </span>
                      <Link href={`/admin/students/${student.id}`} className="font-semibold text-primary hover:underline">
                        {student.fullName}
                      </Link>
                      {student.birthYear ? <BirthYear year={student.birthYear} /> : null}
                      {isNew ? <NewTag /> : null}
                      <p className="mt-0.5 text-sm text-stone-600">
                        {student.parentName ? `${student.parentName} · ` : ""}
                        <a href={`tel:${student.phone}`} className="font-mono">{student.phone}</a>
                      </p>
                    </div>
                    <RowActions studentId={student.id} archived={Boolean(student.archivedAt)} editable={editable} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ClassBadges current={current} pastCount={pastCount} month={month} />
                    <DebtCell debt={debt} studentId={student.id} />
                  </div>
                  {student.note ? <p className="line-clamp-2 text-xs text-stone-500">{student.note}</p> : null}
                </li>
              ))}
            </ul>

            {/* Màn hình lớn: dạng bảng. */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="w-12 px-4 py-2.5 text-center">#</th>
                    <th className="px-4 py-3">Học sinh</th>
                    <th className="px-4 py-3">Phụ huynh · SĐT</th>
                    <th className="px-4 py-3">Lớp · học phí T{month}</th>
                    <th className="px-4 py-3 text-right">Còn nợ</th>
                    <th className="px-4 py-3">Ghi chú</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 [&_tr]:transition-colors [&_tr:hover]:bg-indigo-50/40">
                  {rows.map(({ student, current, pastCount, debt, isNew, editable }, index) => (
                    <tr key={student.id} className={student.archivedAt ? "bg-stone-50/70" : undefined}>
                      <td className="px-4 py-2 text-center text-stone-400">{(page - 1) * PAGE_SIZE + index + 1}</td>
                      <td className="px-4 py-2">
                        <Link href={`/admin/students/${student.id}`} className="font-semibold text-primary hover:underline">
                          {student.fullName}
                        </Link>
                        {student.birthYear ? <BirthYear year={student.birthYear} /> : null}
                        {isNew ? <NewTag /> : null}
                        {student.address ? <div className="max-w-56 truncate text-xs text-stone-500">{student.address}</div> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="text-neutralText">{student.parentName || <span className="text-stone-400">Chưa có tên PH</span>}</div>
                        <a
                          href={`tel:${student.phone}`}
                          className="inline-flex items-center gap-1 font-mono text-xs text-stone-600 hover:text-primary"
                        >
                          <Phone className="h-3 w-3" />
                          {student.phone}
                        </a>
                      </td>
                      <td className="px-4 py-2">
                        <ClassBadges current={current} pastCount={pastCount} month={month} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <DebtCell debt={debt} studentId={student.id} />
                      </td>
                      <td className="px-4 py-2">
                        {student.note ? (
                          <p className="line-clamp-2 max-w-56 text-stone-600" title={student.note}>{student.note}</p>
                        ) : (
                          <span className="text-stone-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <RowActions studentId={student.id} archived={Boolean(student.archivedAt)} editable={editable} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              itemLabel="học sinh"
              hrefFor={(target) => listHref({ page: target })}
            />
          </>
        )}
      </Panel>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function BirthYear({ year }: { year: number }) {
  return (
    <span className="ml-1.5 align-middle text-xs font-medium tabular-nums text-stone-500" title="Năm sinh">
      ({year})
    </span>
  );
}

function NewTag() {
  return (
    <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-success ring-1 ring-inset ring-emerald-600/15">
      Mới
    </span>
  );
}

function DebtCell({ debt, studentId }: { debt: { amount: number; count: number }; studentId: string }) {
  if (debt.count === 0) return <span className="text-xs text-stone-300">—</span>;
  return (
    <Link href={`/admin/students/${studentId}`} className="inline-block text-right hover:underline">
      <span className="block font-bold text-warning">{formatCurrency(debt.amount)}</span>
      <span className="block text-[11px] text-stone-500">{debt.count} hóa đơn</span>
    </Link>
  );
}

type CurrentEnrollment = {
  id: string;
  status: "active" | "on_leave";
  classRoom: { id: string; name: string; shortCode: string };
  /** Trạng thái hóa đơn tháng hiện tại của lớp này; null = chưa tạo. */
  thisMonth: "paid" | "unpaid" | "void" | "waived" | null;
};

const THIS_MONTH_DOT: Record<"paid" | "unpaid" | "void" | "waived", { className: string; label: string }> = {
  paid: { className: "bg-success", label: "đã đóng" },
  unpaid: { className: "bg-warning", label: "chưa đóng" },
  waived: { className: "bg-primary", label: "được miễn" },
  void: { className: "bg-stone-300", label: "hóa đơn đã hủy" }
};

function ClassBadges({ current, pastCount, month }: { current: CurrentEnrollment[]; pastCount: number; month: number }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {current.length === 0 ? (
        <Badge>Chưa vào lớp</Badge>
      ) : (
        current.map((enrollment) => {
          const dot =
            enrollment.status === "on_leave"
              ? null
              : enrollment.thisMonth
                ? THIS_MONTH_DOT[enrollment.thisMonth]
                : { className: "bg-stone-300", label: "chưa tạo hóa đơn" };
          return (
            <Link
              key={enrollment.id}
              href={`/admin/classes?classId=${enrollment.classRoom.id}`}
              title={`${enrollment.classRoom.name}${
                enrollment.status === "on_leave" ? " · bảo lưu" : dot ? ` · T${month} ${dot.label}` : ""
              }`}
              className="focus-ring rounded-full"
            >
              <Badge tone={enrollment.status === "active" ? "primary" : "neutral"}>
                {dot ? <span className={`h-2 w-2 rounded-full ${dot.className}`} /> : null}
                {enrollment.classRoom.shortCode}
                {enrollment.status === "on_leave" ? " · bảo lưu" : ""}
              </Badge>
            </Link>
          );
        })
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
        className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 hover:text-primary"
      >
        <Eye className="h-3.5 w-3.5" />
        Xem
      </Link>
      {!archived ? <EditStudentButton student={editable} size="sm" /> : null}
      <ArchiveEntityButton kind="student" entityId={studentId} entityName={editable.fullName} archived={archived} size="sm" />
    </div>
  );
}
