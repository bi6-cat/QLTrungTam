import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronDown, Pencil, Send } from "lucide-react";
import { ArchiveVocabSetButton } from "@/components/learning/ArchiveVocabSetButton";
import { VocabSetForm } from "@/components/learning/VocabSetForm";
import { Card, Chip, linkButton, PageIntro } from "@/components/portal/kit";
import { formatDayMonth } from "@/lib/format";
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
      <PageIntro
        back={{ href: "/teacher/vocab", label: "Bộ từ vựng" }}
        eyebrow={
          <>
            <Chip tone="violet">{set.words.length} từ</Chip>
            <span>sửa lần cuối {formatDayMonth(set.updatedAt)}</span>
          </>
        }
        title={set.title}
        actions={
          <>
            <Link href={`/teacher/assignments/new?type=vocab&set=${set.id}`} className={linkButton.primary}>
              <Send className="h-4 w-4" />
              Giao bài với bộ này
            </Link>
            <ArchiveVocabSetButton setId={set.id} title={set.title} />
          </>
        }
      />
      {saved ? (
        <p className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Đã lưu bộ từ.
        </p>
      ) : null}

      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {set.words.map((w, i) => (
          <li key={w.id} className="rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 break-words text-base font-bold text-neutralText">{w.term}</p>
              <span className="shrink-0 text-xs tabular-nums text-stone-300">#{i + 1}</span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-stone-700">
              {w.partOfSpeech ? <Chip tone="indigo">{w.partOfSpeech}</Chip> : null}
              {w.meaning}
            </p>
            {w.example ? <p className="mt-2 border-l-2 border-violet-200 pl-2.5 text-sm italic text-stone-500">{w.example}</p> : null}
          </li>
        ))}
      </ol>

      <details className="group">
        <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-3xl border border-stone-200/70 bg-white px-5 py-4 font-semibold text-neutralText shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-stone-50 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Sửa bộ từ
          </span>
          <ChevronDown className="h-4 w-4 text-stone-400 transition group-open:rotate-180" />
        </summary>
        <Card className="rounded-t-none border-t-0">
          <p className="mb-4 text-sm text-stone-600">
            Bài đã làm không đổi theo. Từ giữ nguyên chữ thì vẫn giữ thống kê &quot;từ hay sai&quot; của các bài cũ.
          </p>
          <VocabSetForm key={set.updatedAt.toISOString()} setId={set.id} defaultTitle={set.title} defaultWords={formatWordList(set.words)} />
        </Card>
      </details>
    </>
  );
}
