import { notFound } from "next/navigation";
import { requireTeacher } from "@/modules/identity";

/** Trang bộ từ chỉ mở cho giáo viên được trung tâm bật tính năng từ vựng; người khác thấy 404. */
export async function requireVocabTeacher() {
  const teacher = await requireTeacher();
  if (!teacher.vocabEnabled) notFound();
  return teacher;
}
