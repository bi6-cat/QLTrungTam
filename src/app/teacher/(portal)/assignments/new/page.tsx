import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Camera, ChevronRight, ListChecks, Languages } from "lucide-react";
import { clsx } from "clsx";
import { AssignmentForm } from "@/components/learning/AssignmentForm";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher, type CurrentTeacher } from "@/modules/identity";
import {
  listVocabSets,
  MAX_ATTEMPTS,
  MAX_TIME_LIMIT_MINUTES,
  MIN_WORDS_FOR_CHOICE,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES
} from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Giao bài mới" };

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ type?: string; set?: string }> }) {
  const teacher = await requireTeacher();
  const params = await searchParams;
  // Link cũ "?set=…" (trước khi có bước chọn loại bài) vẫn mở thẳng form từ vựng.
  if ((params.type === "vocab" || params.set) && teacher.vocabEnabled) return <VocabAssignment teacher={teacher} setId={params.set} />;
  return <TypePicker vocabEnabled={teacher.vocabEnabled} />;
}

function TypePicker({ vocabEnabled }: { vocabEnabled: boolean }) {
  const types = [
    {
      key: "vocab",
      icon: Languages,
      title: "Kiểm tra từ vựng",
      text: "Tự sinh câu hỏi từ bộ từ: chọn nghĩa, chọn từ, gõ từ. Mỗi lượt một đề trộn khác nhau.",
      href: vocabEnabled ? "/teacher/assignments/new?type=vocab" : null,
      note: vocabEnabled ? null : "Trung tâm chưa bật cho thầy cô"
    },
    { key: "quiz", icon: ListChecks, title: "Trắc nghiệm", text: "Câu hỏi trắc nghiệm cho mọi môn, nhập đề từ Excel.", href: null, note: "Sắp có" },
    { key: "photo", icon: Camera, title: "Nộp bài bằng ảnh", text: "Học sinh chụp bài làm trên giấy rồi nộp, thầy cô chấm và nhận xét.", href: null, note: "Sắp có" }
  ];
  return (
    <>
      <PageHeader title="Giao bài mới" description="Chọn loại bài muốn giao cho lớp." />
      <ul className="grid gap-3">
        {types.map((t) => {
          const body = (
            <Panel className={clsx("flex items-center gap-4", t.href ? "transition hover:border-primary/40 hover:bg-indigo-50/40" : "opacity-70")}>
              <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", t.href ? "bg-indigo-50 text-primary" : "bg-stone-100 text-stone-400")}>
                <t.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-neutralText">
                  {t.title}
                  {t.note ? <Badge tone="neutral">{t.note}</Badge> : null}
                </span>
                <span className="block text-sm text-stone-600">{t.text}</span>
              </span>
              {t.href ? <ChevronRight className="h-5 w-5 shrink-0 text-stone-400" /> : null}
            </Panel>
          );
          return (
            <li key={t.key}>
              {t.href ? (
                <Link href={t.href} className="focus-ring block rounded-2xl">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function VocabAssignment({ teacher, setId }: { teacher: CurrentTeacher; setId?: string }) {
  const [classes, sets] = await Promise.all([listClassesForTeacher(teacher.id), listVocabSets(teacher.id)]);
  return (
    <>
      <PageHeader title="Giao bài kiểm tra từ vựng" description="Hệ thống tự sinh câu hỏi từ bộ từ, mỗi lượt làm một đề trộn khác nhau." />
      {classes.length === 0 ? (
        <EmptyState title="Chưa được gán lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nhờ trung tâm gán lớp cho tài khoản của thầy cô trước khi giao bài.
        </EmptyState>
      ) : sets.length === 0 ? (
        <EmptyState title="Chưa có bộ từ nào" icon={<Languages className="h-5 w-5" />}>
          <Link href="/teacher/vocab/new" className="font-semibold text-primary hover:underline">
            Tạo bộ từ
          </Link>{" "}
          trước rồi quay lại giao bài.
        </EmptyState>
      ) : (
        <Panel>
          <AssignmentForm
            classes={classes.map((c) => ({ id: c.id, label: `${c.name} (${c.studentCount} HS)` }))}
            sets={sets.map((s) => ({ id: s.id, label: s.title, wordCount: s.wordCount }))}
            types={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABEL[t], choice: t !== "type_term" }))}
            defaultSetId={setId}
            minWordsForChoice={MIN_WORDS_FOR_CHOICE}
            maxAttempts={MAX_ATTEMPTS}
            maxTimeLimit={MAX_TIME_LIMIT_MINUTES}
          />
        </Panel>
      )}
    </>
  );
}
