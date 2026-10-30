import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, Clock, Info, Languages, ListChecks, Lock, Repeat } from "lucide-react";
import { StartAttemptButton } from "@/components/learning/StartAttemptButton";
import { Card, CardHeader, Chip, PageIntro, ProgressRing, ScorePill, scoreTone, type Tone } from "@/components/portal/kit";
import { formatDueIn, formatTimeDay } from "@/lib/format";
import { requireStudent } from "@/modules/identity";
import { getAssignmentForStudent } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bài kiểm tra" };

const STATE: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Đang mở", tone: "emerald" },
  upcoming: { label: "Sắp mở", tone: "sky" },
  closed: { label: "Đã đóng", tone: "stone" }
};

export default async function StudentAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const student = await requireStudent();
  const now = new Date();
  const assignment = await getAssignmentForStudent(student.id, (await params).assignmentId, now);
  if (!assignment) notFound();
  const state = STATE[assignment.state];
  const bestRatio = assignment.bestScore !== null && assignment.maxScore ? assignment.bestScore / assignment.maxScore : null;

  return (
    <>
      <PageIntro
        back={{ href: "/learn", label: "Trang chủ" }}
        eyebrow={
          <>
            <Chip tone="violet" icon={<Languages className="h-3.5 w-3.5" />}>
              Kiểm tra từ vựng
            </Chip>
            <Chip tone={state.tone}>{state.label}</Chip>
          </>
        }
        title={assignment.title}
        subtitle={assignment.className}
      />

      <Card className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="grid gap-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Fact icon={<ListChecks className="h-4 w-4" />} label="Số câu" value={`${assignment.questionCount} câu`} />
            <Fact icon={<Clock className="h-4 w-4" />} label="Thời gian" value={assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} phút` : "Không giới hạn"} />
            <Fact
              icon={<CalendarClock className="h-4 w-4" />}
              label="Hạn nộp"
              value={assignment.dueAt ? formatDueIn(assignment.dueAt, now) : "Không hạn"}
              hint={assignment.dueAt ? formatTimeDay(assignment.dueAt) : undefined}
            />
            <Fact icon={<Repeat className="h-4 w-4" />} label="Lượt đã làm" value={`${assignment.attemptsUsed}/${assignment.maxAttempts}`} />
          </dl>

          {assignment.inProgressAttemptId ? (
            <Action note="Em đang làm dở lượt này. Câu đã chọn vẫn được giữ.">
              <StartAttemptButton assignmentId={assignment.id} resume />
            </Action>
          ) : assignment.canStart ? (
            <Action
              note={
                assignment.timeLimitMinutes
                  ? `Đồng hồ ${assignment.timeLimitMinutes} phút chạy ngay khi em bấm bắt đầu, kể cả khi em thoát ra. Hết giờ bài tự nộp.`
                  : "Bài không giới hạn thời gian. Làm xong nhớ bấm Nộp bài."
              }
            >
              <StartAttemptButton assignmentId={assignment.id} resume={false} />
            </Action>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
              <Lock className="h-4 w-4 shrink-0" />
              {assignment.state === "closed" ? "Bài đã đóng, không làm thêm được." : "Em đã dùng hết số lượt làm bài này."}
            </p>
          )}
        </div>

        {bestRatio !== null ? (
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-stone-50 px-6 py-4">
            <ProgressRing ratio={bestRatio} size={104} stroke={10} tone={scoreTone(bestRatio)}>
              <span>
                <span className="block text-2xl font-bold tabular-nums text-neutralText">
                  {assignment.bestScore}
                  <span className="text-base text-stone-400">/{assignment.maxScore}</span>
                </span>
              </span>
            </ProgressRing>
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Điểm cao nhất</p>
          </div>
        ) : null}
      </Card>

      {assignment.submittedAttempts.length ? (
        <Card>
          <CardHeader title="Các lượt đã nộp" subtitle="Bấm vào một lượt để xem lại bài" />
          <ul className="grid gap-2">
            {assignment.submittedAttempts.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/learn/attempts/${t.id}`}
                  className="focus-ring flex items-center gap-3 rounded-2xl border border-stone-100 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/30"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-sm font-bold text-primary">{t.attemptNo}</span>
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block font-semibold text-neutralText">Lượt {t.attemptNo}</span>
                    <span className="block text-xs text-stone-500">Nộp {formatTimeDay(t.submittedAt)}</span>
                  </span>
                  {t.late ? <Chip tone="rose">Nộp trễ</Chip> : null}
                  <ScorePill score={t.score} max={assignment.maxScore} />
                  <ChevronRight className="h-4 w-4 text-stone-400" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function Fact({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-stone-50 px-3.5 py-3">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-stone-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 font-bold tabular-nums text-neutralText">{value}</dd>
      {hint ? <dd className="text-xs text-stone-400">{hint}</dd> : null}
    </div>
  );
}

function Action({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <p className="flex items-start gap-2 text-sm text-stone-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
        {note}
      </p>
      {children}
    </div>
  );
}
