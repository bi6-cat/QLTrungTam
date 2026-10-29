import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Languages } from "lucide-react";
import { AssignmentForm } from "@/components/learning/AssignmentForm";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";
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

export default async function NewAssignmentPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const teacher = await requireTeacher();
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
            defaultSetId={(await searchParams).set}
            minWordsForChoice={MIN_WORDS_FOR_CHOICE}
            maxAttempts={MAX_ATTEMPTS}
            maxTimeLimit={MAX_TIME_LIMIT_MINUTES}
          />
        </Panel>
      )}
    </>
  );
}
