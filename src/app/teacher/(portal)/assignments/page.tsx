import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ClipboardList, Languages, Plus } from "lucide-react";
import { clsx } from "clsx";
import { AssignmentsSubnav } from "@/components/learning/AssignmentsSubnav";
import { Card, Chip, EmptyBlock, linkButton, PageIntro, ProgressBar, type Tone } from "@/components/portal/kit";
import { formatDueIn } from "@/lib/format";
import { requireTeacher } from "@/modules/identity";
import { listAssignmentsForTeacher, type AssignmentState } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bài tập" };

const KIND = { vocab_quiz: { label: "Từ vựng", tone: "violet" as Tone } } as const;
const STATE: Record<AssignmentState, { label: string; tone: Tone }> = {
  open: { label: "Đang mở", tone: "emerald" },
  upcoming: { label: "Sắp mở", tone: "sky" },
  closed: { label: "Đã đóng", tone: "stone" }
};
const FILTERS = [
  { key: "all", label: "Tất cả" },
  { key: "open", label: "Đang mở" },
  { key: "upcoming", label: "Sắp mở" },
  { key: "closed", label: "Đã đóng" }
] as const;

export default async function TeacherAssignmentsPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const teacher = await requireTeacher();
  const now = new Date();
  const all = await listAssignmentsForTeacher(teacher.id, now);
  const requested = (await searchParams).state;
  const filter = FILTERS.find((f) => f.key === requested)?.key ?? "all";
  const assignments = filter === "all" ? all : all.filter((a) => a.state === filter);
  const count = (key: (typeof FILTERS)[number]["key"]) => (key === "all" ? all.length : all.filter((a) => a.state === key).length);

  return (
    <>
      <PageIntro
        title="Bài tập"
        subtitle="Bài đã giao cho các lớp và tiến độ nộp bài của học sinh."
        actions={
          <Link href="/teacher/assignments/new" className={linkButton.primary}>
            <Plus className="h-4 w-4" />
            Giao bài mới
          </Link>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="scrollbar-none flex gap-1.5 overflow-x-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? "/teacher/assignments" : `/teacher/assignments?state=${f.key}`}
              aria-current={filter === f.key ? "page" : undefined}
              className={clsx(
                "focus-ring inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition",
                filter === f.key ? "bg-neutralText text-white" : "bg-white text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-stone-50"
              )}
            >
              {f.label}
              <span className={clsx("tabular-nums", filter === f.key ? "text-white/70" : "text-stone-400")}>{count(f.key)}</span>
            </Link>
          ))}
        </nav>
        <AssignmentsSubnav active="assignments" vocabEnabled={teacher.vocabEnabled} />
      </div>

      {assignments.length === 0 ? (
        <EmptyBlock
          icon={<ClipboardList className="h-6 w-6" />}
          title={all.length === 0 ? "Chưa giao bài nào" : "Không có bài nào ở mục này"}
          action={
            all.length === 0 ? (
              <Link href="/teacher/assignments/new" className={linkButton.primary}>
                <Plus className="h-4 w-4" />
                Giao bài đầu tiên
              </Link>
            ) : undefined
          }
        >
          {all.length === 0 ? "Chọn loại bài, chọn lớp, hệ thống lo phần chấm điểm." : null}
        </EmptyBlock>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((a) => {
            const kind = KIND[a.kind];
            const state = STATE[a.state];
            const ratio = a.classSize ? a.submittedStudents / a.classSize : 0;
            return (
              <li key={a.id}>
                <Link href={`/teacher/assignments/${a.id}`} className="focus-ring block h-full rounded-3xl">
                  <Card interactive className="flex h-full flex-col gap-4">
                    <div className="flex items-center justify-between gap-2">
                      <Chip tone={kind.tone} icon={<Languages className="h-3.5 w-3.5" />}>
                        {kind.label}
                      </Chip>
                      <Chip tone={state.tone}>{state.label}</Chip>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="line-clamp-2 text-base font-bold text-neutralText">{a.title}</h2>
                      <p className="mt-1 text-sm text-stone-500">
                        {a.className} · {a.questionCount} câu
                      </p>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="font-semibold tabular-nums text-neutralText">
                          {a.submittedStudents}/{a.classSize ?? "?"} đã nộp
                        </span>
                        <span className="tabular-nums text-stone-500">{Math.round(ratio * 100)}%</span>
                      </div>
                      <ProgressBar value={a.submittedStudents} max={a.classSize ?? 0} tone={a.state === "closed" ? "stone" : "violet"} />
                    </div>
                    <p className="flex items-center gap-1.5 border-t border-stone-100 pt-3 text-xs text-stone-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {a.state === "closed" ? "Đã đóng" : a.dueAt ? formatDueIn(a.dueAt, now) : "Không hạn nộp"}
                    </p>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
