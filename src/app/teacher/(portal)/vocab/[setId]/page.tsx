import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";
import { ArchiveVocabSetButton } from "@/components/learning/ArchiveVocabSetButton";
import { VocabSetForm } from "@/components/learning/VocabSetForm";
import { PageHeader, Panel } from "@/components/ui";
import { requireVocabTeacher } from "@/app/teacher/(portal)/vocab/require-vocab";
import { formatWordList, getVocabSet } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bộ từ" };

export default async function VocabSetPage({
  params,
  searchParams
}: {
  params: Promise<{ setId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const teacher = await requireVocabTeacher();
  const set = await getVocabSet(teacher.id, (await params).setId);
  if (!set) notFound();
  const saved = (await searchParams).saved === "1";

  return (
    <>
      <PageHeader
        title={set.title}
        description={`${set.words.length} từ`}
        actions={
          <>
            <Link
              href={`/teacher/assignments/new?type=vocab&set=${set.id}`}
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-b from-indigo-600 to-primary px-4 text-sm font-semibold text-white shadow-sm hover:from-indigo-700 hover:to-indigo-900"
            >
              <Send className="h-4 w-4" />
              Giao bài với bộ này
            </Link>
            <ArchiveVocabSetButton setId={set.id} title={set.title} />
          </>
        }
      />
      {saved ? (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Đã lưu bộ từ.
        </p>
      ) : null}

      <Panel className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Từ</th>
                <th className="px-4 py-2">Nghĩa</th>
                <th className="px-4 py-2">Ví dụ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {set.words.map((w, i) => (
                <tr key={w.id}>
                  <td className="px-4 py-2 tabular-nums text-stone-400">{i + 1}</td>
                  <td className="px-4 py-2 font-medium">
                    {w.term}
                    {w.partOfSpeech ? <span className="ml-1 text-xs text-stone-400">({w.partOfSpeech})</span> : null}
                  </td>
                  <td className="px-4 py-2">{w.meaning}</td>
                  <td className="px-4 py-2 text-stone-500">{w.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel>
        <h2 className="mb-1 text-lg font-bold text-neutralText">Sửa bộ từ</h2>
        <p className="mb-4 text-sm text-stone-600">
          Bài đã làm không đổi theo. Từ giữ nguyên chữ thì vẫn giữ thống kê &quot;từ hay sai&quot; của các bài cũ.
        </p>
        <VocabSetForm key={set.updatedAt.toISOString()} setId={set.id} defaultTitle={set.title} defaultWords={formatWordList(set.words)} />
      </Panel>
    </>
  );
}
