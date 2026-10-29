import Link from "next/link";
import { ArrowUpRight, BookOpen, Users } from "lucide-react";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { teacherPath } from "@/lib/class-links";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";

export const dynamic = "force-dynamic";

export default async function TeacherHomePage() {
  const teacher = await requireTeacher();
  const classes = await listClassesForTeacher(teacher.id);

  return (
    <>
      <PageHeader title="Lớp của tôi" description="Các lớp trung tâm đã gán cho tài khoản của thầy cô." />
      {classes.length === 0 ? (
        <EmptyState title="Chưa được gán lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nhờ trung tâm gán lớp cho tài khoản <span className="font-mono">{teacher.username}</span>.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <li key={c.id}>
              <Panel className="grid h-full gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold text-neutralText">{c.name}</h2>
                    <p className="font-mono text-xs text-stone-500">{c.shortCode}</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-primary">
                    <Users className="h-3.5 w-3.5" />
                    {c.studentCount} học sinh
                  </span>
                </div>
                <Link
                  href={teacherPath(c)}
                  className="focus-ring inline-flex w-fit items-center gap-1 rounded-lg text-sm font-semibold text-primary hover:underline"
                >
                  Điểm danh và học phí
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
