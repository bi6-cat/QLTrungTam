"use server";

import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireTeacher } from "@/modules/identity";
import { createMaterial, deleteMaterial, LearningError, updateMaterial } from "@/modules/learning";

const text = (formData: FormData, key: string, max: number) => String(formData.get(key) ?? "").slice(0, max);

export async function saveMaterialAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const teacher = await requireTeacher();
  const materialId = text(formData, "materialId", 100) || null;
  const input = {
    classId: text(formData, "classId", 100),
    title: text(formData, "title", 200),
    url: text(formData, "url", 4000),
    note: text(formData, "note", 4000)
  };
  try {
    if (materialId) await updateMaterial(teacher.id, materialId, input);
    else await createMaterial(teacher.id, input);
  } catch (saveError) {
    if (saveError instanceof LearningError) return errorState(saveError.message);
    console.error("Không lưu được tài liệu.", saveError);
    return errorState("Không lưu được tài liệu. Vui lòng tải lại trang và thử lại.");
  }
  redirect(`/teacher/materials?saved=1#class-${input.classId}`);
}

export async function deleteMaterialAction(materialId: string): Promise<ResultState> {
  const teacher = await requireTeacher();
  try {
    await deleteMaterial(teacher.id, String(materialId));
    return successState("Đã gỡ tài liệu. Học sinh không còn thấy tài liệu này.");
  } catch (deleteError) {
    if (deleteError instanceof LearningError) return errorState(deleteError.message);
    console.error("Không gỡ được tài liệu.", deleteError);
    return errorState("Không gỡ được tài liệu. Vui lòng tải lại trang và thử lại.");
  }
}
