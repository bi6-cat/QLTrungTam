import type { Metadata } from "next";
import { VocabSetForm } from "@/components/learning/VocabSetForm";
import { PageHeader, Panel } from "@/components/ui";
import { requireVocabTeacher } from "@/app/teacher/(portal)/vocab/require-vocab";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tạo bộ từ" };

export default async function NewVocabSetPage() {
  await requireVocabTeacher();
  return (
    <>
      <PageHeader title="Tạo bộ từ" description="Dán danh sách từ, bấm Xem trước để kiểm tra rồi Lưu." />
      <Panel>
        <VocabSetForm />
      </Panel>
    </>
  );
}
