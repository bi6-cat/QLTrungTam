import type { Metadata } from "next";
import { BookOpen, FolderOpen } from "lucide-react";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { requireStudent } from "@/modules/identity";
import { listMaterialsForStudent } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài liệu" };

export default async function LearnMaterialsPage() {
  const student = await requireStudent();
  const groups = await listMaterialsForStudent(student.id);

  return (
    <>
      <PageHeader title="Tài liệu" description="Tài liệu thầy cô chia sẻ cho các lớp của em." />
      {groups.length === 0 ? (
        <EmptyState title="Em chưa có lớp nào" icon={<BookOpen className="h-5 w-5" />}>
          Nếu em đang đi học, báo thầy cô để trung tâm kiểm tra lại.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <Panel key={g.classId} className="p-0">
            <div className="border-b border-stone-100 px-5 py-3">
              <h2 className="text-lg font-bold text-neutralText">{g.className}</h2>
              {g.teacherName ? <p className="text-sm text-stone-500">{g.teacherName}</p> : null}
            </div>
            {g.materials.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-4 text-sm text-stone-500">
                <FolderOpen className="h-4 w-4" />
                Thầy cô chưa chia sẻ tài liệu cho lớp này.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {g.materials.map((m) => (
                  <li key={m.id}>
                    <MaterialCard material={m} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))
      )}
    </>
  );
}
