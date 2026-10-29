"use server";

import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireStudent } from "@/modules/identity";
import { LearningError, parseAnswerPayload, startAttempt, submitAttempt } from "@/modules/learning";

export async function startAttemptAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const student = await requireStudent();
  let attemptId: string;
  try {
    ({ attemptId } = await startAttempt(student.id, String(formData.get("assignmentId") ?? "")));
  } catch (startError) {
    if (startError instanceof LearningError) return errorState(startError.message);
    console.error("Không bắt đầu được lượt làm bài.", startError);
    return errorState("Không bắt đầu được bài. Em tải lại trang và thử lại nhé.");
  }
  redirect(`/learn/attempts/${attemptId}`);
}

export async function submitAttemptAction(attemptId: string, answers: unknown): Promise<ResultState> {
  const student = await requireStudent();
  const parsed = parseAnswerPayload(answers);
  if (!parsed) return errorState("Câu trả lời gửi lên không hợp lệ. Em tải lại trang rồi nộp lại nhé.");
  try {
    const result = await submitAttempt(student.id, String(attemptId), parsed);
    return successState(`Đã nộp bài: ${result.score}/${result.maxScore} câu đúng.`);
  } catch (submitError) {
    if (submitError instanceof LearningError) return errorState(submitError.message);
    console.error("Không nộp được bài.", submitError);
    return errorState("Chưa nộp được bài. Câu trả lời vẫn lưu trên máy này, em bấm Nộp bài lại nhé.");
  }
}
