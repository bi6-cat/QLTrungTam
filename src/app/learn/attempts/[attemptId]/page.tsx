import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { clsx } from "clsx";
import { QuizRunner } from "@/components/learning/QuizRunner";
import { Badge, PageHeader, Panel } from "@/components/ui";
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
        <PageHeader
          title={attempt.title}
          description={`Lượt ${attempt.attemptNo} · ${attempt.items.length} câu${attempt.endsAt ? ` · hết giờ lúc ${formatTimeDay(attempt.endsAt)}` : ""}`}
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
      <PageHeader
        title={attempt.title}
        description={`Lượt ${attempt.attemptNo} · nộp lúc ${formatTimeDay(attempt.submittedAt!)}`}
      />

      <Panel className="grid gap-4 text-center sm:grid-cols-[auto_1fr] sm:items-center sm:text-left">
        <p className="text-5xl font-extrabold tabular-nums tracking-tight text-primary">
          {score}
          <span className="text-2xl text-stone-400">/{attempt.maxScore}</span>
        </p>
        <div>
          <p className="text-lg font-bold text-neutralText">{cheer(percent)}</p>
          <p className="text-sm text-stone-600">
            Em trả lời đúng {score} trên {attempt.maxScore} câu ({percent}%).
            {attempt.late ? (
              <>
                {" "}
                <Badge tone="warning">Nộp trễ</Badge>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:col-span-2 sm:justify-start">
          <Link
            href={`/learn/assignments/${attempt.assignmentId}`}
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-neutralText shadow-sm hover:bg-stone-50"
          >
            {canRetry ? <RotateCcw className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            {canRetry ? "Làm lượt mới" : "Về bài"}
          </Link>
        </div>
      </Panel>

      {attempt.showAnswers ? (
        <Panel>
          <h2 className="text-lg font-bold text-neutralText">Đáp án</h2>
          <ol className="mt-3 grid gap-2">
            {attempt.items.map((item) => (
              <li
                key={item.position}
                className={clsx(
                  "flex items-start gap-3 rounded-xl border p-3",
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
        </Panel>
      ) : (
        <p className="text-center text-sm text-stone-500">Thầy cô không bật xem đáp án cho bài này.</p>
      )}
    </>
  );
}
