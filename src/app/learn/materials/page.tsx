import type { Metadata } from "next";
import { BookOpen, FolderOpen } from "lucide-react";
import { MaterialCard } from "@/components/learning/MaterialCard";
import { Chip, EmptyBlock, PageIntro } from "@/components/portal/kit";
import { requireStudent } from "@/modules/identity";
import { listMaterialsForStudent } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tài liệu" };

export default async function LearnMaterialsPage() {
  const student = await requireStudent();
  const groups = await listMaterialsForStudent(student.id);

  return (
    <>
      <PageIntro title="Tài liệu" subtitle="Tài liệu thầy cô chia sẻ cho các lớp của em." />
      {groups.length === 0 ? (
        <EmptyBlock icon={<BookOpen className="h-6 w-6" />} title="Em chưa có lớp nào">
          Nếu em đang đi học, báo thầy cô để trung tâm kiểm tra lại.
        </EmptyBlock>
      ) : (
        groups.map((g) => (
          <section key={g.classId} className="grid gap-3">
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-neutralText">
              {g.className}
              <Chip>{g.materials.length}</Chip>
              {g.teacherName ? <span className="text-sm font-normal text-stone-500">· {g.teacherName}</span> : null}
            </h2>
            {g.materials.length === 0 ? (
              <p className="flex items-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/60 px-4 py-5 text-sm text-stone-500">
                <FolderOpen className="h-4 w-4" />
                Thầy cô chưa chia sẻ tài liệu cho lớp này.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.materials.map((m) => (
                  <li key={m.id}>
                    <MaterialCard material={m} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </>
  );
}
