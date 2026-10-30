import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DeleteMaterialButton } from "@/components/learning/DeleteMaterialButton";
import { MaterialForm } from "@/components/learning/MaterialForm";
import { PageHeader, Panel } from "@/components/ui";
import { listClassesForTeacher } from "@/modules/center";
import { requireTeacher } from "@/modules/identity";
import { getMaterialForTeacher, MAX_MATERIAL_NOTE, MAX_MATERIAL_TITLE } from "@/modules/learning";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sửa tài liệu" };

export default async function EditMaterialPage({ params }: { params: Promise<{ materialId: string }> }) {
  const teacher = await requireTeacher();
  const [material, classes] = await Promise.all([getMaterialForTeacher(teacher.id, (await params).materialId), listClassesForTeacher(teacher.id)]);
  if (!material) notFound();
  // Lớp hiện tại của tài liệu luôn có trong danh sách, kể cả khi thầy cô không còn dạy lớp đó.
  const options = classes.map((c) => ({ id: c.id, label: c.name }));
  if (!options.some((o) => o.id === material.classId)) options.unshift({ id: material.classId, label: material.className });

  return (
    <>
      <PageHeader title={material.title} description={material.className} actions={<DeleteMaterialButton materialId={material.id} title={material.title} />} />
      <Panel>
        <MaterialForm
          key={material.updatedAt.toISOString()}
          classes={options}
          maxTitle={MAX_MATERIAL_TITLE}
          maxNote={MAX_MATERIAL_NOTE}
          materialId={material.id}
          defaults={{ classId: material.classId, title: material.title, url: material.url ?? "", note: material.note }}
        />
      </Panel>
    </>
  );
}
