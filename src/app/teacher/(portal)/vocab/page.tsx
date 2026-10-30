import type { Metadata } from "next";
import Link from "next/link";
import { Languages, Plus } from "lucide-react";
import { AssignmentsSubnav } from "@/components/learning/AssignmentsSubnav";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { formatDayMonth } from "@/lib/format";
import { requireVocabTeacher } from "@/app/teacher/(portal)/vocab/require-vocab";
import { listVocabSets } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bộ từ vựng" };

const newButton =
  "focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-600 to-primary px-4 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-indigo-900";

export default async function VocabSetsPage() {
  const teacher = await requireVocabTeacher();
  const sets = await listVocabSets(teacher.id);

  return (
    <>
      <PageHeader
        title="Bộ từ vựng"
        description="Bộ từ dùng lại được cho nhiều lớp và nhiều bài kiểm tra."
        actions={
          <Link href="/teacher/vocab/new" className={newButton}>
            <Plus className="h-4 w-4" />
            Tạo bộ từ
          </Link>
        }
      />
      <AssignmentsSubnav active="vocab" vocabEnabled />
      {sets.length === 0 ? (
        <EmptyState title="Chưa có bộ từ nào" icon={<Languages className="h-5 w-5" />}>
          Tạo bộ từ đầu tiên bằng cách dán danh sách từ (mỗi dòng một từ, ví dụ <code>apple - quả táo</code>) hoặc tải file Excel lên.
        </EmptyState>
      ) : (
        <Panel className="p-0">
          <ul className="divide-y divide-stone-100">
            {sets.map((s) => (
              <li key={s.id}>
                <Link href={`/teacher/vocab/${s.id}`} className="focus-ring flex items-center justify-between gap-3 px-5 py-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-neutralText">{s.title}</span>
                    <span className="block text-xs text-stone-500">
                      {s.wordCount} từ · {s.assignmentCount > 0 ? `đã giao ${s.assignmentCount} bài` : "chưa giao bài"} · sửa {formatDayMonth(s.updatedAt)}
                    </span>
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
