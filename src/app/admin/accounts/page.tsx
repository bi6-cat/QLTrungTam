import Link from "next/link";
import { GraduationCap, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { StudentAccounts } from "@/components/portal-accounts/StudentAccounts";
import { TeacherAccounts } from "@/components/portal-accounts/TeacherAccounts";
import { EmptyState, PageHeader, Panel, Select } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { listAssignableClasses, listCurrentStudentsInClass } from "@/modules/center";
import { getStudentAccounts, listTeacherAccounts } from "@/modules/identity";

export const dynamic = "force-dynamic";

type Tab = "teachers" | "students";

export default async function AccountsPage({
  searchParams
}: {
  searchParams: Promise<{ tab?: string; class?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const tab: Tab = params.tab === "students" ? "students" : "teachers";
  const now = new Date();
  const classes = await listAssignableClasses();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Tài khoản học tập"
        description="Tài khoản đăng nhập cổng giáo viên và cổng học sinh. Không liên quan tới tài khoản quản trị."
      />

      <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
        {(
          [
            { key: "teachers", label: "Giáo viên", icon: UserRound },
            { key: "students", label: "Học sinh", icon: GraduationCap }
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            href={item.key === "teachers" ? "/admin/accounts" : "/admin/accounts?tab=students"}
            scroll={false}
            aria-current={tab === item.key ? "page" : undefined}
            className={clsx(
              "focus-ring -mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              tab === item.key ? "border-primary text-primary" : "border-transparent text-stone-500 hover:text-neutralText"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === "teachers" ? <TeachersTab classes={classes} now={now} /> : <StudentsTab classes={classes} classId={params.class} now={now} />}
    </div>
  );
}

type ClassOption = Awaited<ReturnType<typeof listAssignableClasses>>[number];

async function TeachersTab({ classes, now }: { classes: ClassOption[]; now: Date }) {
  const teachers = await listTeacherAccounts();
  const teacherNames = new Map(teachers.map((t) => [t.id, t.fullName]));
  // Gợi ý họ tên: các tên giáo viên của lớp chưa có tài khoản, gõ đúng tên thì tự gán lớp.
  const suggestions = [...new Set(classes.filter((c) => !c.teacherId && c.teacherName.trim()).map((c) => c.teacherName.trim()))].sort(
    (a, b) => a.localeCompare(b, "vi")
  );

  return (
    <TeacherAccounts
      teachers={teachers.map((t) => ({
        id: t.id,
        username: t.username,
        fullName: t.fullName,
        disabled: t.disabledAt !== null,
        vocabEnabled: t.vocabEnabled,
        lockedUntil: t.lockedUntil && t.lockedUntil > now ? t.lockedUntil.toISOString() : null,
        classIds: t.classes.map((c) => c.id),
        classNames: t.classes.map((c) => c.name)
      }))}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        shortCode: c.shortCode,
        teacherName: c.teacherName,
        assignedTo: c.teacherId ? { id: c.teacherId, name: teacherNames.get(c.teacherId) ?? "" } : null
      }))}
      nameSuggestions={suggestions}
    />
  );
}

async function StudentsTab({ classes, classId, now }: { classes: ClassOption[]; classId?: string; now: Date }) {
  const selected = classes.find((c) => c.id === classId) ?? null;
  const students = selected ? await listCurrentStudentsInClass(selected.id, now) : [];
  const accounts = await getStudentAccounts(students.map((s) => s.id));

  return (
    <div className="grid gap-5">
      <Panel>
        <AutoSubmitForm action="/admin/accounts" className="grid max-w-md gap-1.5">
          <input type="hidden" name="tab" value="students" />
          <label htmlFor="account-class" className="text-sm font-medium text-stone-700">
            Lớp
          </label>
          <Select id="account-class" name="class" defaultValue={selected?.id ?? ""}>
            <option value="" disabled>
              Chọn lớp để cấp tài khoản…
            </option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.shortCode})
              </option>
            ))}
          </Select>
        </AutoSubmitForm>
      </Panel>

      {selected ? (
        <StudentAccounts
          classRoom={{ id: selected.id, name: selected.name, shortCode: selected.shortCode }}
          students={students.map((s) => {
            const account = accounts.get(s.id);
            return {
              id: s.id,
              fullName: s.fullName,
              onLeave: s.onLeave,
              code: account?.code ?? null,
              locked: Boolean(account?.lockedUntil && account.lockedUntil > now)
            };
          })}
        />
      ) : (
        <EmptyState title="Chọn một lớp" icon={<GraduationCap className="h-5 w-5" />}>
          Học sinh đăng nhập cổng học tập bằng mã học sinh và mã PIN. Chọn lớp để cấp tài khoản và tải phiếu in phát cho cả lớp.
        </EmptyState>
      )}
    </div>
  );
}
