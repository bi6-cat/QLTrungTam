import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { MaterialForm } from "@/components/learning/MaterialForm";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";
import { MAX_MATERIAL_NOTE, MAX_MATERIAL_TITLE } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Thêm tài liệu" };

export default async function NewMaterialPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const teacher = await requireTeacher();
  const classes = await listClassesForTeacher(teacher.id);
  const classId = (await searchParams).class;

  return (
    <>
      <PageHeader title="Thêm tài liệu" description="Học sinh trong lớp thấy tài liệu ngay ở mục Tài liệu của cổng học sinh." />
      {classes.length === 0 ? (
        <EmptyState title="Chưa được gán lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nhờ trung tâm gán lớp cho tài khoản của thầy cô trước khi đăng tài liệu.
        </EmptyState>
      ) : (
        <Panel>
          <MaterialForm
            classes={classes.map((c) => ({ id: c.id, label: c.name }))}
            maxTitle={MAX_MATERIAL_TITLE}
            maxNote={MAX_MATERIAL_NOTE}
            defaults={{ classId: classes.some((c) => c.id === classId) ? classId : undefined }}
          />
        </Panel>
      )}
    </>
  );
}
