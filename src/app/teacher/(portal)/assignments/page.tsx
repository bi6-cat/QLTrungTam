import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { AssignmentStateBadge } from "@/components/learning/AssignmentStateBadge";
import { AssignmentsSubnav } from "@/components/learning/AssignmentsSubnav";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatTimeDay } from "@/lib/format";
import { requireTeacher } from "@/modules/identity";
import { listAssignmentsForTeacher } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bài tập" };

const KIND_LABEL = { vocab_quiz: "Kiểm tra từ vựng" } as const;

export default async function TeacherAssignmentsPage() {
  const teacher = await requireTeacher();
  const assignments = await listAssignmentsForTeacher(teacher.id);

  return (
    <>
      <PageHeader
        title="Bài tập"
        description="Bài đã giao cho các lớp và kết quả của học sinh."
        actions={
          <Link
            href="/teacher/assignments/new"
            className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-600 to-primary px-4 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-indigo-900"
          >
            <Plus className="h-4 w-4" />
            Giao bài mới
          </Link>
        }
      />
      <AssignmentsSubnav active="assignments" vocabEnabled={teacher.vocabEnabled} />
      {assignments.length === 0 ? (
        <EmptyState title="Chưa giao bài nào" icon={<ClipboardList className="h-5 w-5" />}>
          Bấm &quot;Giao bài mới&quot; để chọn loại bài và giao cho lớp.
        </EmptyState>
      ) : (
        <Panel className="p-0">
          <ul className="divide-y divide-stone-100">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link href={`/teacher/assignments/${a.id}`} className="focus-ring flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-semibold text-neutralText">
                      {a.title}
                      <AssignmentStateBadge state={a.state} />
                    </span>
                    <span className="block text-xs text-stone-500">
                      {KIND_LABEL[a.kind]} · {a.className} · {a.questionCount} câu · {a.dueAt ? `hạn ${formatTimeDay(a.dueAt)}` : "không hạn"}
                    </span>
                  </span>
                  <span className="text-sm tabular-nums text-stone-600">
                    {a.submittedStudents}
                    {a.classSize !== null ? `/${a.classSize}` : ""} em đã nộp
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </>
  );
}
