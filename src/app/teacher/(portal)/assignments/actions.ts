"use server";

import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { parseVietnamDateTime } from "@/lib/format";
import { requireTeacher } from "@/modules/identity";
import { closeAssignment, createVocabAssignment, LearningError } from "@/modules/learning";

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const whole = (value: string) => (/^\d+$/.test(value) ? Number(value) : NaN);

export async function createAssignmentAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const teacher = await requireTeacher();
  const dueText = text(formData, "dueAt");
  const dueAt = dueText ? parseVietnamDateTime(dueText) : null;
  if (dueText && !dueAt) return errorState("Hạn nộp không hợp lệ.");
  const timeText = text(formData, "timeLimitMinutes");

  let id: string;
  try {
    ({ id } = await createVocabAssignment(teacher.id, {
      classId: text(formData, "classId"),
      setId: text(formData, "setId"),
      title: text(formData, "title").slice(0, 200),
      questionTypes: formData.getAll("questionTypes").map(String),
      questionCount: whole(text(formData, "questionCount")),
      timeLimitMinutes: timeText ? whole(timeText) : null,
      maxAttempts: whole(text(formData, "maxAttempts")),
      dueAt,
      showAnswers: formData.get("showAnswers") === "on"
    }));
  } catch (createError) {
    if (createError instanceof LearningError) return errorState(createError.message);
    console.error("Không giao được bài.", createError);
    return errorState("Không giao được bài. Vui lòng tải lại trang và thử lại.");
  }
  redirect(`/teacher/assignments/${id}`);
}

export async function closeAssignmentAction(assignmentId: string): Promise<ResultState> {
  const teacher = await requireTeacher();
  try {
    await closeAssignment(teacher.id, String(assignmentId));
    return successState("Đã đóng bài. Học sinh không bắt đầu lượt mới được nữa.");
  } catch (closeError) {
    if (closeError instanceof LearningError) return errorState(closeError.message);
    console.error("Không đóng được bài.", closeError);
    return errorState("Không đóng được bài. Vui lòng tải lại trang và thử lại.");
  }
}
