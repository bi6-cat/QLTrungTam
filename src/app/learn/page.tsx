import { ClipboardList } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireStudent } from "@/modules/identity";

export const dynamic = "force-dynamic";

export default async function LearnHomePage() {
  await requireStudent();

  return (
    <>
      <PageHeader title="Bài cần làm" description="Bài thầy cô giao cho các lớp của em." />
      <EmptyState title="Chưa có bài nào" icon={<ClipboardList className="h-5 w-5" />}>
        Khi thầy cô giao bài, ví dụ bài kiểm tra từ vựng, bài sẽ hiện ở đây kèm hạn nộp.
      </EmptyState>
    </>
  );
}
