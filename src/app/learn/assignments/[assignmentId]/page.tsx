import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AssignmentStateBadge } from "@/components/learning/AssignmentStateBadge";
import { StartAttemptButton } from "@/components/learning/StartAttemptButton";
import { PageHeader, Panel } from "@/components/ui";
import { formatTimeDay } from "@/lib/format";
import { requireStudent } from "@/modules/identity";
import { getAssignmentForStudent } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bài kiểm tra" };

export default async function StudentAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const student = await requireStudent();
  const assignment = await getAssignmentForStudent(student.id, (await params).assignmentId);
  if (!assignment) notFound();

  return (
    <>
      <PageHeader title={assignment.title} description={assignment.className} />

      <Panel className="grid gap-5">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Số câu">{assignment.questionCount} câu</Stat>
          <Stat label="Thời gian">{assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} phút` : "Không giới hạn"}</Stat>
          <Stat label="Hạn nộp">{assignment.dueAt ? formatTimeDay(assignment.dueAt) : "Không hạn"}</Stat>
          <Stat label="Lượt đã làm">
            {assignment.attemptsUsed}/{assignment.maxAttempts}
          </Stat>
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
          <p className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
            {assignment.state === "closed" ? (
              <>
                <AssignmentStateBadge state="closed" /> Bài đã đóng, không làm thêm được.
              </>
            ) : (
              "Em đã dùng hết số lượt làm bài này."
            )}
          </p>
        )}
      </Panel>

      {assignment.submittedAttempts.length ? (
        <Panel className="p-0">
          <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
            <h2 className="text-lg font-bold text-neutralText">Các lượt đã nộp</h2>
            {assignment.bestScore !== null ? (
              <p className="text-sm text-stone-600">
                Cao nhất{" "}
                <b className="tabular-nums text-neutralText">
                  {assignment.bestScore}/{assignment.maxScore}
                </b>
              </p>
            ) : null}
          </div>
          <ul className="mt-2 divide-y divide-stone-100">
            {assignment.submittedAttempts.map((t) => (
              <li key={t.id}>
                <Link href={`/learn/attempts/${t.id}`} className="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="text-sm">
                    <span className="font-medium text-neutralText">Lượt {t.attemptNo}</span>
                    <span className="text-stone-500"> · nộp {formatTimeDay(t.submittedAt)}</span>
                    {t.late ? <span className="ml-2 text-xs text-warning">nộp trễ</span> : null}
                  </span>
                  <span className="flex items-center gap-2 font-semibold tabular-nums text-neutralText">
                    {t.score}/{assignment.maxScore}
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums text-neutralText">{children}</dd>
    </div>
  );
}

function Action({ note, children }: { note: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-t border-stone-100 pt-4">
      <p className="text-sm text-stone-600">{note}</p>
      {children}
    </div>
  );
}
