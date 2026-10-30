import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Camera, ChevronRight, ListChecks, Languages } from "lucide-react";
import { clsx } from "clsx";
import { Card, Chip, EmptyBlock, PageIntro, toneClass, type Tone } from "@/components/portal/kit";
import { AssignmentForm } from "@/components/learning/AssignmentForm";
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
      tone: "violet" as Tone,
      title: "Kiểm tra từ vựng",
      text: "Tự sinh câu hỏi từ bộ từ: chọn nghĩa, chọn từ, gõ từ. Mỗi lượt một đề trộn khác nhau.",
      href: vocabEnabled ? "/teacher/assignments/new?type=vocab" : null,
      note: vocabEnabled ? null : "Trung tâm chưa bật cho thầy cô"
    },
    { key: "quiz", icon: ListChecks, tone: "amber" as Tone, title: "Trắc nghiệm", text: "Câu hỏi trắc nghiệm cho mọi môn, nhập đề từ Excel.", href: null, note: "Sắp có" },
    { key: "photo", icon: Camera, tone: "sky" as Tone, title: "Nộp bài bằng ảnh", text: "Học sinh chụp bài làm trên giấy rồi nộp, thầy cô chấm và nhận xét.", href: null, note: "Sắp có" }
  ];
  return (
    <>
      <PageIntro back={{ href: "/teacher/assignments", label: "Bài tập" }} title="Giao bài mới" subtitle="Chọn loại bài muốn giao cho lớp." />
      <ul className="grid gap-4 md:grid-cols-3">
        {types.map((t) => {
          const tone = toneClass(t.tone);
          const body = (
            <Card interactive={Boolean(t.href)} className={clsx("flex h-full flex-col gap-4", !t.href && "opacity-70")}>
              <div className="flex items-start justify-between gap-2">
                <span className={clsx("grid h-12 w-12 place-items-center rounded-2xl", tone.soft, tone.text)}>
                  <t.icon className="h-6 w-6" />
                </span>
                {t.note ? <Chip>{t.note}</Chip> : <ChevronRight className="h-5 w-5 text-stone-400" />}
              </div>
              <div>
                <p className="text-base font-bold text-neutralText">{t.title}</p>
                <p className="mt-1 text-sm text-stone-600">{t.text}</p>
              </div>
            </Card>
          );
          return (
            <li key={t.key}>
              {t.href ? (
                <Link href={t.href} className="focus-ring block h-full rounded-3xl">
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
      <PageIntro
        back={{ href: "/teacher/assignments/new", label: "Chọn loại bài" }}
        eyebrow={<Chip tone="violet" icon={<Languages className="h-3.5 w-3.5" />}>Từ vựng</Chip>}
        title="Giao bài kiểm tra từ vựng"
        subtitle="Hệ thống tự sinh câu hỏi từ bộ từ, mỗi lượt làm một đề trộn khác nhau."
      />
      {classes.length === 0 ? (
        <EmptyBlock title="Chưa được gán lớp nào" icon={<BookOpen className="h-6 w-6" />}>
          Nhờ trung tâm gán lớp cho tài khoản của thầy cô trước khi giao bài.
        </EmptyBlock>
      ) : sets.length === 0 ? (
        <EmptyBlock title="Chưa có bộ từ nào" icon={<Languages className="h-6 w-6" />}>
          <Link href="/teacher/vocab/new" className="font-semibold text-primary hover:underline">
            Tạo bộ từ
          </Link>{" "}
          trước rồi quay lại giao bài.
        </EmptyBlock>
      ) : (
        <Card>
          <AssignmentForm
            classes={classes.map((c) => ({ id: c.id, label: `${c.name} (${c.studentCount} HS)` }))}
            sets={sets.map((s) => ({ id: s.id, label: s.title, wordCount: s.wordCount }))}
            types={QUESTION_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_LABEL[t], choice: t !== "type_term" }))}
            defaultSetId={setId}
            minWordsForChoice={MIN_WORDS_FOR_CHOICE}
            maxAttempts={MAX_ATTEMPTS}
            maxTimeLimit={MAX_TIME_LIMIT_MINUTES}
          />
        </Card>
      )}
    </>
  );
}
