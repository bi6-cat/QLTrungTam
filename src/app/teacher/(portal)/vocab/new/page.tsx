import type { Metadata } from "next";
import { VocabSetForm } from "@/components/learning/VocabSetForm";
import { PageHeader, Panel } from "@/components/ui";
import { requireTeacher } from "@/modules/identity";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tạo bộ từ" };

export default async function NewVocabSetPage() {
  await requireTeacher();
  return (
    <>
      <PageHeader title="Tạo bộ từ" description="Dán danh sách từ, bấm Xem trước để kiểm tra rồi Lưu." />
      <Panel>
        <VocabSetForm />
      </Panel>
    </>
  );
}
