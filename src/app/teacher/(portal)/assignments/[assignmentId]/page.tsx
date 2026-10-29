import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AssignmentStateBadge } from "@/components/learning/AssignmentStateBadge";
import { CloseAssignmentButton } from "@/components/learning/CloseAssignmentButton";
import { Badge, PageHeader, Panel } from "@/components/ui";
import { formatTimeDay } from "@/lib/format";
import { requireTeacher } from "@/modules/identity";
import { getAssignmentResults, QUESTION_TYPE_LABEL, type QuestionType } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kết quả bài" };

export default async function AssignmentResultsPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const teacher = await requireTeacher();
  const results = await getAssignmentResults(teacher.id, (await params).assignmentId);
  if (!results) notFound();
  const { assignment, students, hardWords } = results;
  const submitted = students.filter((s) => s.submittedAttempts > 0);
  const average = submitted.length
    ? Math.round((submitted.reduce((sum, s) => sum + (s.bestScore ?? 0), 0) / submitted.length / assignment.questionCount) * 100)
    : null;

  return (
    <>
      <PageHeader
        title={assignment.title}
        description={`${assignment.className} · bộ "${assignment.setTitle}"`}
        actions={assignment.state !== "closed" ? <CloseAssignmentButton assignmentId={assignment.id} /> : null}
      />

      <Panel className="grid gap-3 sm:grid-cols-4">
        <Stat label="Trạng thái">
          <AssignmentStateBadge state={assignment.state} />
        </Stat>
        <Stat label="Đã nộp">
          {submitted.length}/{students.filter((s) => !s.leftClass).length} em
        </Stat>
        <Stat label="Điểm trung bình">{average === null ? "—" : `${average}%`}</Stat>
        <Stat label="Hạn nộp">{assignment.dueAt ? formatTimeDay(assignment.dueAt) : "Không hạn"}</Stat>
        <p className="text-xs text-stone-500 sm:col-span-4">
          {assignment.questionCount} câu ·{" "}
          {assignment.questionTypes.map((t) => QUESTION_TYPE_LABEL[t as QuestionType] ?? t).join(", ")} ·{" "}
          {assignment.timeLimitMinutes ? `${assignment.timeLimitMinutes} phút` : "không giới hạn thời gian"} · tối đa{" "}
          {assignment.maxAttempts} lượt
        </p>
      </Panel>

      <Panel className="p-0">
        <h2 className="px-5 pt-4 text-lg font-bold text-neutralText">Học sinh</h2>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[520px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-2">Học sinh</th>
                <th className="px-5 py-2">Điểm cao nhất</th>
                <th className="px-5 py-2">Lượt</th>
                <th className="px-5 py-2">Nộp lúc</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {students.map((s) => (
                <tr key={s.studentId}>
                  <td className="px-5 py-2">
                    <span className="font-medium text-neutralText">{s.fullName}</span>
                    {s.leftClass ? <span className="ml-2 text-xs text-stone-400">đã rời lớp</span> : null}
                  </td>
                  <td className="px-5 py-2 tabular-nums">
                    {s.bestScore !== null ? (
                      <span className="font-semibold">
                        {s.bestScore}/{assignment.questionCount}
                      </span>
                    ) : s.inProgress ? (
                      <Badge tone="primary">Đang làm</Badge>
                    ) : (
                      <span className="text-stone-400">Chưa làm</span>
                    )}
                    {s.late ? <span className="ml-2 text-xs text-warning">nộp trễ</span> : null}
                  </td>
                  <td className="px-5 py-2 tabular-nums text-stone-600">
                    {s.submittedAttempts}/{assignment.maxAttempts}
                    {s.inProgress && s.bestScore !== null ? " · đang làm thêm" : ""}
                  </td>
                  <td className="px-5 py-2 tabular-nums text-stone-600">{s.lastSubmittedAt ? formatTimeDay(s.lastSubmittedAt) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-lg font-bold text-neutralText">Từ cả lớp hay sai</h2>
        {hardWords.length === 0 ? (
          <p className="text-sm text-stone-500">{submitted.length ? "Chưa có từ nào bị sai." : "Chưa có bài nộp."}</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {hardWords.map((w) => {
              const percent = Math.round((w.wrong / w.total) * 100);
              return (
                <li key={w.label} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm">
                  <span className="truncate font-medium">{w.label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-stone-100">
                    <span className="block h-full rounded-full bg-rose-400" style={{ width: `${percent}%` }} />
                  </span>
                  <span className="tabular-nums text-stone-600">
                    sai {w.wrong}/{w.total}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 font-semibold text-neutralText">{children}</p>
    </div>
  );
}
