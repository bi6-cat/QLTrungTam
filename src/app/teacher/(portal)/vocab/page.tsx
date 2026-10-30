import type { Metadata } from "next";
import Link from "next/link";
import { Languages, Plus, Send } from "lucide-react";
import { AssignmentsSubnav } from "@/components/learning/AssignmentsSubnav";
import { Card, Chip, EmptyBlock, linkButton, PageIntro } from "@/components/portal/kit";
import { formatDayMonth } from "@/lib/format";
import { requireVocabTeacher } from "@/app/teacher/(portal)/vocab/require-vocab";
import { listVocabSets } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bộ từ vựng" };

export default async function VocabSetsPage() {
  const teacher = await requireVocabTeacher();
  const sets = await listVocabSets(teacher.id);

  return (
    <>
      <PageIntro
        title="Bộ từ vựng"
        subtitle="Bộ từ dùng lại được cho nhiều lớp và nhiều bài kiểm tra."
        actions={
          <Link href="/teacher/vocab/new" className={linkButton.primary}>
            <Plus className="h-4 w-4" />
            Tạo bộ từ
          </Link>
        }
      />
      <AssignmentsSubnav active="vocab" vocabEnabled />
      {sets.length === 0 ? (
        <EmptyBlock
          icon={<Languages className="h-6 w-6" />}
          title="Chưa có bộ từ nào"
          action={
            <Link href="/teacher/vocab/new" className={linkButton.primary}>
              <Plus className="h-4 w-4" />
              Tạo bộ từ đầu tiên
            </Link>
          }
        >
          Dán danh sách từ (mỗi dòng một từ, ví dụ <code>apple - quả táo</code>) hoặc tải file Excel lên.
        </EmptyBlock>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sets.map((s) => (
            <li key={s.id}>
              <Card interactive className="flex h-full flex-col gap-4">
                <Link href={`/teacher/vocab/${s.id}`} className="focus-ring -m-1 flex-1 rounded-2xl p-1">
                  <div className="flex items-start gap-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-sm">
                      <Languages className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="line-clamp-2 font-bold text-neutralText">{s.title}</h2>
                      <p className="text-xs text-stone-500">
                        {s.wordCount} từ · sửa {formatDayMonth(s.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {s.previewTerms.map((term) => (
                      <span key={term} className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                        {term}
                      </span>
                    ))}
                    {s.wordCount > s.previewTerms.length ? (
                      <span className="rounded-lg px-1 py-1 text-xs text-stone-400">+{s.wordCount - s.previewTerms.length}</span>
                    ) : null}
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 border-t border-stone-100 pt-3">
                  {s.assignmentCount > 0 ? <Chip tone="violet">Đã giao {s.assignmentCount} bài</Chip> : <Chip>Chưa giao bài</Chip>}
                  <Link
                    href={`/teacher/assignments/new?type=vocab&set=${s.id}`}
                    className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-primary hover:bg-indigo-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Giao bài
                  </Link>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
