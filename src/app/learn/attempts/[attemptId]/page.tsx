import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Clock, ListChecks, RotateCcw, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { QuizRunner } from "@/components/learning/QuizRunner";
import { Card, CardHeader, Chip, linkButton, PageIntro, ProgressRing, scoreTone } from "@/components/portal/kit";
import { formatTimeDay } from "@/lib/format";
import { requireStudent } from "@/modules/identity";
import { getAssignmentForStudent, getAttemptForStudent, QUESTION_TYPE_LABEL } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Làm bài" };

type Attempt = NonNullable<Awaited<ReturnType<typeof getAttemptForStudent>>>;

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const student = await requireStudent();
  const attempt = await getAttemptForStudent(student.id, (await params).attemptId);
  if (!attempt) notFound();

  if (!attempt.submittedAt) {
    return (
      <>
        <PageIntro
          eyebrow={
            <>
              <Chip tone="violet">Lượt {attempt.attemptNo}</Chip>
              <Chip icon={<ListChecks className="h-3.5 w-3.5" />}>{attempt.items.length} câu</Chip>
              {attempt.endsAt ? <Chip tone="amber" icon={<Clock className="h-3.5 w-3.5" />}>Hết giờ lúc {formatTimeDay(attempt.endsAt)}</Chip> : null}
            </>
          }
          title={attempt.title}
        />
        <QuizRunner
          attemptId={attempt.id}
          questions={attempt.items.map((item) => ({
            position: item.position,
            typed: item.type === "type_term",
            instruction: QUESTION_TYPE_LABEL[item.type],
            prompt: item.prompt,
            options: item.options
          }))}
          endsAt={attempt.endsAt?.getTime() ?? null}
          serverNow={Date.now()}
        />
      </>
    );
  }

  // Học sinh đã rời lớp vẫn xem được lượt của mình, chỉ không còn nút làm lượt mới.
  const assignment = await getAssignmentForStudent(student.id, attempt.assignmentId);
  return <AttemptResult attempt={attempt} canRetry={assignment?.canStart ?? false} />;
}

function cheer(percent: number) {
  if (percent >= 90) return "Xuất sắc!";
  if (percent >= 70) return "Làm tốt lắm!";
  if (percent >= 50) return "Khá rồi, cố thêm chút nữa nhé.";
  return "Ôn lại các từ rồi thử lại nhé.";
}

function AttemptResult({ attempt, canRetry }: { attempt: Attempt; canRetry: boolean }) {
  const score = attempt.score ?? 0;
  const percent = attempt.maxScore ? Math.round((score / attempt.maxScore) * 100) : 0;

  return (
    <>
      <PageIntro
        back={{ href: `/learn/assignments/${attempt.assignmentId}`, label: "Về bài" }}
        eyebrow={
          <>
            <Chip tone="violet">Lượt {attempt.attemptNo}</Chip>
            <span>nộp lúc {formatTimeDay(attempt.submittedAt!)}</span>
            {attempt.late ? <Chip tone="rose">Nộp trễ</Chip> : null}
          </>
        }
        title={attempt.title}
      />

      <Card className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
        <ProgressRing ratio={percent / 100} size={128} stroke={12} tone={scoreTone(percent / 100)}>
          <span>
            <span className="block text-3xl font-extrabold tabular-nums text-neutralText">
              {score}
              <span className="text-lg text-stone-400">/{attempt.maxScore}</span>
            </span>
            <span className="block text-xs font-semibold text-stone-500">{percent}%</span>
          </span>
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-bold tracking-tight text-neutralText">{cheer(percent)}</p>
          <p className="mt-1 text-sm text-stone-600">
            Em trả lời đúng {score} trên {attempt.maxScore} câu.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
            <Link href={`/learn/assignments/${attempt.assignmentId}`} className={canRetry ? linkButton.primary : linkButton.secondary}>
              {canRetry ? <RotateCcw className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              {canRetry ? "Làm lượt mới" : "Về bài"}
            </Link>
            <Link href="/learn" className={linkButton.secondary}>
              Về trang chủ
            </Link>
          </div>
        </div>
      </Card>

      {attempt.showAnswers ? (
        <Card>
          <CardHeader
            title="Đáp án"
            subtitle={`${attempt.items.filter((i) => i.isCorrect).length} câu đúng · ${attempt.items.filter((i) => !i.isCorrect).length} câu cần ôn lại`}
          />
          <ol className="grid gap-2 md:grid-cols-2">
            {attempt.items.map((item) => (
              <li
                key={item.position}
                className={clsx(
                  "flex items-start gap-3 rounded-2xl border p-3.5",
                  item.isCorrect ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"
                )}
              >
                {item.isCorrect ? (
                  <CheckCircle2 aria-label="Đúng" className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle aria-label="Sai" className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
                )}
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-stone-500">
                    Câu {item.position} · {QUESTION_TYPE_LABEL[item.type]}
                  </p>
                  <p className="break-words font-semibold text-neutralText">{item.prompt}</p>
                  <p className="break-words">
                    Em trả lời:{" "}
                    {item.answer ? (
                      <span className={item.isCorrect ? "font-medium text-emerald-700" : "font-medium text-rose-700"}>{item.answer}</span>
                    ) : (
                      <span className="italic text-stone-400">bỏ trống</span>
                    )}
                  </p>
                  {!item.isCorrect ? (
                    <p className="break-words">
                      Đáp án: <b className="text-emerald-700">{item.correctAnswer}</b>
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      ) : (
        <p className="text-center text-sm text-stone-500">Thầy cô không bật xem đáp án cho bài này.</p>
      )}
    </>
  );
}
