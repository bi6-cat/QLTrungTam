import Link from "next/link";
import { ChevronRight, ClipboardList } from "lucide-react";
import { clsx } from "clsx";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatTimeDay } from "@/lib/format";
import { requireStudent } from "@/modules/identity";
import { listAssignmentsForStudent, type StudentAssignment } from "@/modules/learning";

export const dynamic = "force-dynamic";

const DUE_SOON_MS = 24 * 60 * 60 * 1000;

export default async function LearnHomePage() {
  const student = await requireStudent();
  const now = new Date();
  const assignments = await listAssignmentsForStudent(student.id, now);
  const todo = assignments.filter((a) => a.canStart || a.inProgressAttemptId);
  const others = assignments.filter((a) => !a.canStart && !a.inProgressAttemptId);

  return (
    <>
      <PageHeader title="Bài cần làm" description="Bài thầy cô giao cho các lớp của em." />
      {assignments.length === 0 ? (
        <EmptyState title="Chưa có bài nào" icon={<ClipboardList className="h-5 w-5" />}>
          Khi thầy cô giao bài, ví dụ bài kiểm tra từ vựng, bài sẽ hiện ở đây kèm hạn nộp.
        </EmptyState>
      ) : (
        <>
          <AssignmentList title="Cần làm" empty="Em đã làm hết bài. Giỏi lắm!" assignments={todo} now={now} />
          {others.length ? <AssignmentList title="Đã làm và đã đóng" assignments={others} now={now} /> : null}
        </>
      )}
    </>
  );
}

function AssignmentList({ title, empty, assignments, now }: { title: string; empty?: string; assignments: StudentAssignment[]; now: Date }) {
  return (
    <Panel className="p-0">
      <h2 className="px-5 pt-4 text-lg font-bold text-neutralText">{title}</h2>
      {assignments.length === 0 ? (
        <p className="px-5 pb-4 pt-1 text-sm text-stone-500">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-stone-100">
          {assignments.map((a) => {
            const dueSoon = a.state === "open" && a.dueAt !== null && a.dueAt.getTime() - now.getTime() < DUE_SOON_MS;
            return (
              <li key={a.id}>
                <Link href={`/learn/assignments/${a.id}`} className="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block font-semibold text-neutralText">{a.title}</span>
                    <span className="block text-xs text-stone-500">
                      {a.className} · {a.questionCount} câu
                      {a.timeLimitMinutes ? ` · ${a.timeLimitMinutes} phút` : ""}
                      {a.dueAt ? (
                        <>
                          {" · "}
                          <span className={clsx(dueSoon && "font-semibold text-warning")}>hạn {formatTimeDay(a.dueAt)}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <AssignmentStatus assignment={a} />
                    <ChevronRight className="h-4 w-4 text-stone-400" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

function AssignmentStatus({ assignment: a }: { assignment: StudentAssignment }) {
  if (a.inProgressAttemptId) return <Badge tone="primary">Đang làm dở</Badge>;
  if (a.bestScore !== null) {
    return (
      <span className="text-sm font-semibold tabular-nums text-neutralText">
        {a.bestScore}/{a.maxScore}
      </span>
    );
  }
  if (a.canStart) return <Badge tone="warning">Chưa làm</Badge>;
  return <Badge tone="neutral">Không làm</Badge>;
}
