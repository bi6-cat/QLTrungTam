import Link from "next/link";
import { CalendarClock, CheckCircle2, ClipboardList, Clock, FolderOpen, ListChecks, PlayCircle, Sparkles } from "lucide-react";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { Card, CardHeader, Chip, EmptyBlock, linkButton, ProgressRing, ScorePill, TextLink } from "@/components/portal/kit";
import { formatDueIn, greetingFor } from "@/lib/format";
import { requireStudent } from "@/modules/identity";
import { listAssignmentsForStudent, listMaterialsForStudent, type StudentAssignment } from "@/modules/learning";

export const dynamic = "force-dynamic";

const DUE_SOON_MS = 24 * 60 * 60 * 1000;

export default async function LearnHomePage() {
  const student = await requireStudent();
  const now = new Date();
  const [assignments, materialGroups] = await Promise.all([listAssignmentsForStudent(student.id, now), listMaterialsForStudent(student.id, now)]);
  const todo = assignments.filter((a) => a.canStart || a.inProgressAttemptId);
  const others = assignments.filter((a) => !a.canStart && !a.inProgressAttemptId);
  const done = assignments.filter((a) => a.bestScore !== null).length;
  const nextDue = todo.find((a) => a.dueAt);
  const recentMaterials = materialGroups
    .flatMap((g) => g.materials.map((m) => ({ ...m, className: g.className })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 3);
  const firstName = student.fullName.trim().split(/\s+/).at(-1) ?? student.fullName;

  return (
    <>
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 p-6 text-white shadow-lg shadow-violet-900/20 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-16 h-64 w-64 rounded-full bg-white/15 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-amber-300/25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-violet-100">
              <Sparkles className="h-4 w-4" />
              {greetingFor(now)}
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Chào {firstName}!</h1>
            <p className="mt-2 text-sm text-violet-100 sm:text-base">
              {todo.length > 0
                ? `Em còn ${todo.length} bài cần làm${nextDue?.dueAt ? `, bài gần nhất ${formatDueIn(nextDue.dueAt, now)}` : ""}.`
                : "Em đã làm hết bài rồi. Giỏi lắm!"}
            </p>
          </div>
          {assignments.length > 0 ? (
            <div className="hidden rounded-3xl bg-white/15 p-3 ring-1 ring-inset ring-white/25 backdrop-blur sm:block">
              <ProgressRing ratio={done / assignments.length} size={92} stroke={9} tone="amber">
                <span className="text-white">
                  <span className="block text-xl font-bold tabular-nums">
                    {done}/{assignments.length}
                  </span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-violet-100">đã làm</span>
                </span>
              </ProgressRing>
            </div>
          ) : null}
        </div>
      </section>

      {assignments.length === 0 ? (
        <EmptyBlock icon={<ClipboardList className="h-6 w-6" />} title="Chưa có bài nào">
          Khi thầy cô giao bài, ví dụ bài kiểm tra từ vựng, bài sẽ hiện ở đây kèm hạn nộp.
        </EmptyBlock>
      ) : (
        <section className="grid gap-3">
          <h2 className="text-lg font-bold text-neutralText">Bài cần làm</h2>
          {todo.length === 0 ? (
            <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              Không còn bài nào cần làm. Em giỏi quá!
            </p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {todo.map((a) => (
                <li key={a.id}>
                  <TodoCard assignment={a} now={now} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {others.length > 0 ? (
          <Card>
            <CardHeader title="Đã làm và đã đóng" />
            <ul className="divide-y divide-stone-100">
              {others.map((a) => (
                <li key={a.id}>
                  <Link href={`/learn/assignments/${a.id}`} className="focus-ring -mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-stone-50">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-500">
                      <ListChecks className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutralText">{a.title}</span>
                      <span className="block text-xs text-stone-500">{a.className}</span>
                    </span>
                    {a.bestScore !== null ? <ScorePill score={a.bestScore} max={a.maxScore} /> : <Chip>Không làm</Chip>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card className={others.length > 0 ? undefined : "lg:col-span-2"}>
          <CardHeader title="Tài liệu mới" action={<TextLink href="/learn/materials">Xem tất cả</TextLink>} />
          {recentMaterials.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-stone-500">
              <FolderOpen className="h-4 w-4" />
              Thầy cô chưa chia sẻ tài liệu nào.
            </p>
          ) : (
            <ul className="grid gap-3">
              {recentMaterials.map((m) => (
                <li key={m.id}>
                  <MaterialCard material={m} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function TodoCard({ assignment: a, now }: { assignment: StudentAssignment; now: Date }) {
  const soon = a.dueAt !== null && a.dueAt.getTime() - now.getTime() < DUE_SOON_MS;
  return (
    <Card interactive className="flex h-full flex-col gap-4 overflow-hidden p-0 sm:p-0">
      <div className="h-1.5 bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-400" />
      <div className="flex flex-1 flex-col gap-4 px-5 pb-5 sm:px-6 sm:pb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Kiểm tra từ vựng</p>
            <h3 className="mt-1 line-clamp-2 text-lg font-bold text-neutralText">{a.title}</h3>
            <p className="text-sm text-stone-500">{a.className}</p>
          </div>
          {a.inProgressAttemptId ? <Chip tone="indigo">Đang làm dở</Chip> : a.bestScore !== null ? <ScorePill score={a.bestScore} max={a.maxScore} /> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip icon={<ListChecks className="h-3.5 w-3.5" />}>{a.questionCount} câu</Chip>
          <Chip icon={<Clock className="h-3.5 w-3.5" />}>{a.timeLimitMinutes ? `${a.timeLimitMinutes} phút` : "Không giới hạn"}</Chip>
          {a.dueAt ? (
            <Chip tone={soon ? "rose" : "stone"} icon={<CalendarClock className="h-3.5 w-3.5" />}>
              {formatDueIn(a.dueAt, now)}
            </Chip>
          ) : null}
          {a.maxAttempts > 1 ? <Chip>Lượt {a.attemptsUsed}/{a.maxAttempts}</Chip> : null}
        </div>
        <Link href={`/learn/assignments/${a.id}`} className={`${linkButton.primary} mt-auto w-full`}>
          <PlayCircle className="h-4 w-4" />
          {a.inProgressAttemptId ? "Làm tiếp" : a.bestScore !== null ? "Làm lượt mới" : "Làm bài"}
        </Link>
      </div>
    </Card>
  );
}
