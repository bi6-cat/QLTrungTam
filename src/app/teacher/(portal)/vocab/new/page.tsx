import type { Metadata } from "next";
import { VocabSetForm } from "@/components/learning/VocabSetForm";
import { Card, PageIntro } from "@/components/portal/kit";
import { requireVocabTeacher } from "@/app/teacher/(portal)/vocab/require-vocab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tạo bộ từ" };

export default async function NewVocabSetPage() {
  await requireVocabTeacher();
  return (
    <>
      <PageIntro back={{ href: "/teacher/vocab", label: "Bộ từ vựng" }} title="Tạo bộ từ" subtitle="Dán danh sách từ hoặc tải file lên, bấm Xem trước để kiểm tra rồi Lưu." />
      <Card>
        <VocabSetForm />
      </Card>
    </>
  );
}
