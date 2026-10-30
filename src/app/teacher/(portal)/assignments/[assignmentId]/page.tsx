import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Award, CalendarClock, Clock, Languages, ListChecks, Repeat, Target, Users } from "lucide-react";
import { CloseAssignmentButton } from "@/components/learning/CloseAssignmentButton";
import { Avatar, Card, CardHeader, Chip, PageIntro, ProgressRing, ScorePill, StatTile, toneClass, type Tone } from "@/components/portal/kit";
import { formatDueIn, formatTimeDay } from "@/lib/format";
import { requireTeacher } from "@/modules/identity";
import { getAssignmentResults, QUESTION_TYPE_LABEL, type QuestionType } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kết quả bài" };

const STATE: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Đang mở", tone: "emerald" },
  upcoming: { label: "Sắp mở", tone: "sky" },
  closed: { label: "Đã đóng", tone: "stone" }
};

const BUCKETS: { label: string; min: number; tone: Tone }[] = [
  { label: "Từ 85%", min: 0.85, tone: "emerald" },
  { label: "65 – 84%", min: 0.65, tone: "indigo" },
  { label: "50 – 64%", min: 0.5, tone: "amber" },
  { label: "Dưới 50%", min: 0, tone: "rose" }
];

export default async function AssignmentResultsPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const teacher = await requireTeacher();
  const now = new Date();
  const results = await getAssignmentResults(teacher.id, (await params).assignmentId, now);
  if (!results) notFound();
  const { assignment, students, hardWords } = results;
  const max = assignment.questionCount;
  const roster = students.filter((s) => !s.leftClass);
  const submitted = students.filter((s) => s.bestScore !== null);
  const scores = submitted.map((s) => (s.bestScore ?? 0) / max);
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null;
  const best = submitted.length ? Math.max(...submitted.map((s) => s.bestScore ?? 0)) : null;
  const buckets = BUCKETS.map((b, i) => ({
    ...b,
    count: scores.filter((r) => r >= b.min && (i === 0 || r < BUCKETS[i - 1].min)).length
  }));
  const biggest = Math.max(1, ...buckets.map((b) => b.count));
  const state = STATE[assignment.state];

  return (
    <>
      <PageIntro
        back={{ href: "/teacher/assignments", label: "Bài tập" }}
        eyebrow={
          <>
            <Chip tone="violet" icon={<Languages className="h-3.5 w-3.5" />}>
              Từ vựng
            </Chip>
            <Chip tone={state.tone}>{state.label}</Chip>
          </>
        }
        title={assignment.title}
        subtitle={`${assignment.className} · bộ "${assignment.setTitle}"`}
        actions={assignment.state !== "closed" ? <CloseAssignmentButton assignmentId={assignment.id} /> : null}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Users className="h-5 w-5" />} label="Đã nộp" value={`${submitted.length}/${roster.length}`} hint="học sinh" tone="violet" />
        <StatTile icon={<Target className="h-5 w-5" />} label="Điểm trung bình" value={average === null ? "—" : `${average}%`} tone="indigo" />
        <StatTile icon={<Award className="h-5 w-5" />} label="Cao nhất" value={best === null ? "—" : `${best}/${max}`} tone="emerald" />
        <StatTile
          icon={<CalendarClock className="h-5 w-5" />}
          label="Hạn nộp"
          value={assignment.state === "closed" ? "Đã đóng" : assignment.dueAt ? formatDueIn(assignment.dueAt, now) : "Không hạn"}
          hint={assignment.dueAt ? formatTimeDay(assignment.dueAt) : undefined}
          tone="amber"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Chip icon={<ListChecks className="h-3.5 w-3.5" />}>{max} câu</Chip>
        {assignment.questionTypes.map((t) => (
          <Chip key={t}>{QUESTION_TYPE_LABEL[t as QuestionType] ?? t}</Chip>
        ))}
        <Chip icon={<Clock className="h-3.5 w-3.5" />}>{assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} phút` : "Không giới hạn giờ"}</Chip>
        <Chip icon={<Repeat className="h-3.5 w-3.5" />}>Tối đa {assignment.maxAttempts} lượt</Chip>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="p-0 sm:p-0">
          <div className="p-5 pb-0 sm:p-6 sm:pb-0">
            <CardHeader title="Học sinh" subtitle={`${submitted.length} đã nộp · ${roster.length - submitted.length} chưa có điểm`} />
          </div>
          <ul className="divide-y divide-stone-100">
            {students.map((s) => (
              <li key={s.studentId} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                <Avatar name={s.fullName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-neutralText">
                    {s.fullName}
                    {s.leftClass ? <span className="ml-2 text-xs font-normal text-stone-400">đã rời lớp</span> : null}
                  </p>
                  <p className="text-xs text-stone-500">
                    {s.submittedAttempts > 0
                      ? `Lượt ${s.submittedAttempts}/${assignment.maxAttempts} · nộp ${s.lastSubmittedAt ? formatTimeDay(s.lastSubmittedAt) : ""}`
                      : s.inProgress
                        ? "Đang làm bài"
                        : "Chưa bắt đầu"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {s.late ? <Chip tone="rose">Trễ</Chip> : null}
                  {s.inProgress && s.bestScore !== null ? <Chip tone="indigo">Làm thêm</Chip> : null}
                  {s.bestScore !== null ? (
                    <ScorePill score={s.bestScore} max={max} />
                  ) : s.inProgress ? (
                    <Chip tone="indigo">Đang làm</Chip>
                  ) : (
                    <Chip>Chưa làm</Chip>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid content-start gap-6 lg:sticky lg:top-10">
          <Card>
            <CardHeader title="Tổng quan điểm" />
            <div className="flex items-center gap-5">
              <ProgressRing ratio={roster.length ? submitted.length / roster.length : 0} size={96} stroke={10} tone="violet">
                <span>
                  <span className="block text-xl font-bold tabular-nums text-neutralText">{roster.length ? Math.round((submitted.length / roster.length) * 100) : 0}%</span>
                  <span className="block text-[10px] font-medium uppercase tracking-wide text-stone-500">đã nộp</span>
                </span>
              </ProgressRing>
              <ul className="grid flex-1 gap-2">
                {buckets.map((b) => (
                  <li key={b.label} className="grid grid-cols-[4.5rem_1fr_1.5rem] items-center gap-2 text-xs">
                    <span className="text-stone-500">{b.label}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                      <span className={`block h-full rounded-full ${toneClass(b.tone).solid}`} style={{ width: `${(b.count / biggest) * 100}%` }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-neutralText">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card>
            <CardHeader title="Từ cả lớp hay sai" subtitle="Nên ôn lại trên lớp" />
            {hardWords.length === 0 ? (
              <p className="text-sm text-stone-500">{submitted.length ? "Chưa có từ nào bị sai. Tuyệt vời!" : "Chưa có bài nộp."}</p>
            ) : (
              <ul className="grid gap-2.5">
                {hardWords.map((w) => {
                  const percent = Math.round((w.wrong / w.total) * 100);
                  return (
                    <li key={w.label}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-semibold text-neutralText">{w.label}</span>
                        <span className="shrink-0 text-xs tabular-nums text-stone-500">
                          sai {w.wrong}/{w.total}
                        </span>
                      </div>
                      <span className="block h-1.5 overflow-hidden rounded-full bg-rose-50">
                        <span className="block h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500" style={{ width: `${percent}%` }} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
