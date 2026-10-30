import Link from "next/link";
import { ArrowUpRight, BookOpen, CalendarClock, ClipboardList, FolderPlus, Languages, Plus, Send, TrendingUp, Users } from "lucide-react";
import { Card, CardHeader, Chip, EmptyBlock, linkButton, ProgressBar, StatTile, TextLink } from "@/components/portal/kit";
import { teacherPath } from "@/lib/class-links";
import { formatDueIn, formatWeekdayDate, greetingFor } from "@/lib/format";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";
import { listAssignmentsForTeacher } from "@/modules/learning";

export const dynamic = "force-dynamic";

const DUE_SOON_MS = 24 * 60 * 60 * 1000;

export default async function TeacherHomePage() {
  const teacher = await requireTeacher();
  const now = new Date();
  const [classes, assignments] = await Promise.all([listClassesForTeacher(teacher.id, now), listAssignmentsForTeacher(teacher.id, now)]);

  const open = assignments
    .filter((a) => a.state === "open")
    .sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const students = classes.reduce((sum, c) => sum + c.studentCount, 0);
  const counted = assignments.filter((a) => a.state !== "upcoming" && a.classSize);
  const submissionRate = counted.length
    ? Math.round((counted.reduce((sum, a) => sum + a.submittedStudents, 0) / counted.reduce((sum, a) => sum + (a.classSize ?? 0), 0)) * 100)
    : null;
  const missing = open.reduce((sum, a) => sum + Math.max(0, (a.classSize ?? 0) - a.submittedStudents), 0);
  const openByClass = new Map<string, number>();
  for (const a of open) openByClass.set(a.classId, (openByClass.get(a.classId) ?? 0) + 1);

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1e1b4b] via-primary to-violet-600 p-6 text-white shadow-lg shadow-indigo-900/20 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-40 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p className="text-sm font-medium text-indigo-200">{formatWeekdayDate(now)}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
              {greetingFor(now)}, {teacher.fullName}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-indigo-100 sm:text-base">
              {open.length > 0
                ? `Đang mở ${open.length} bài, còn ${missing} lượt nộp đang chờ học sinh.`
                : "Chưa có bài nào đang mở. Giao bài mới để cả lớp luyện tập nhé."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/teacher/assignments/new" className={linkButton.white}>
              <Send className="h-4 w-4" />
              Giao bài mới
            </Link>
            <Link href="/teacher/materials/new" className={linkButton.light}>
              <FolderPlus className="h-4 w-4" />
              Đăng tài liệu
            </Link>
            {teacher.vocabEnabled ? (
              <Link href="/teacher/vocab/new" className={linkButton.light}>
                <Languages className="h-4 w-4" />
                Tạo bộ từ
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<BookOpen className="h-5 w-5" />} label="Lớp đang dạy" value={classes.length} tone="indigo" />
        <StatTile icon={<Users className="h-5 w-5" />} label="Học sinh" value={students} tone="sky" />
        <StatTile icon={<ClipboardList className="h-5 w-5" />} label="Bài đang mở" value={open.length} tone="violet" />
        <StatTile
          icon={<TrendingUp className="h-5 w-5" />}
          label="Tỉ lệ nộp bài"
          value={submissionRate === null ? "—" : `${submissionRate}%`}
          hint={submissionRate === null ? "chưa có bài" : `${counted.length} bài đã giao`}
          tone="emerald"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader title="Bài đang mở" subtitle="Hạn gần nhất lên trước" action={<TextLink href="/teacher/assignments">Tất cả bài</TextLink>} />
          {open.length === 0 ? (
            <EmptyBlock
              icon={<ClipboardList className="h-6 w-6" />}
              title="Không có bài nào đang mở"
              action={
                <Link href="/teacher/assignments/new" className={linkButton.primary}>
                  <Plus className="h-4 w-4" />
                  Giao bài mới
                </Link>
              }
            />
          ) : (
            <ul className="grid gap-2">
              {open.slice(0, 6).map((a) => {
                const soon = a.dueAt !== null && a.dueAt.getTime() - now.getTime() < DUE_SOON_MS;
                return (
                  <li key={a.id}>
                    <Link href={`/teacher/assignments/${a.id}`} className="focus-ring block rounded-2xl border border-stone-100 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/30">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-neutralText">{a.title}</p>
                          <p className="text-xs text-stone-500">{a.className}</p>
                        </div>
                        <Chip tone={soon ? "rose" : "stone"} icon={<CalendarClock className="h-3.5 w-3.5" />}>
                          {a.dueAt ? formatDueIn(a.dueAt, now) : "không hạn"}
                        </Chip>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <ProgressBar value={a.submittedStudents} max={a.classSize ?? 0} tone="violet" className="flex-1" />
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-stone-600">
                          {a.submittedStudents}/{a.classSize ?? "?"} đã nộp
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Lớp của tôi" subtitle={`${classes.length} lớp · ${students} học sinh`} />
          {classes.length === 0 ? (
            <EmptyBlock icon={<BookOpen className="h-6 w-6" />} title="Chưa được gán lớp nào">
              Nhờ trung tâm gán lớp cho tài khoản <span className="font-mono">{teacher.username}</span>.
            </EmptyBlock>
          ) : (
            <ul className="grid gap-2">
              {classes.map((c) => (
                <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-stone-100 p-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-100 text-[11px] font-bold text-primary ring-1 ring-inset ring-indigo-100">
                    {c.shortCode.slice(0, 5)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-neutralText">{c.name}</p>
                    <p className="text-xs text-stone-500">
                      {c.studentCount} học sinh
                      {openByClass.get(c.id) ? ` · ${openByClass.get(c.id)} bài đang mở` : ""}
                    </p>
                  </div>
                  <Link
                    href={teacherPath(c)}
                    title="Điểm danh và học phí"
                    className="focus-ring inline-flex h-9 shrink-0 items-center gap-1 rounded-xl px-2.5 text-xs font-semibold text-primary hover:bg-indigo-50"
                  >
                    Điểm danh
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
