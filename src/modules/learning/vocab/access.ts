import { isVocabEnabled } from "@/modules/identity";
import { LearningError } from "../errors";

export const VOCAB_DISABLED_MESSAGE = "Trung tâm chưa bật tính năng kiểm tra từ vựng cho thầy cô.";

/** Tạo/sửa bộ từ và giao bài từ vựng chỉ cho giáo viên được trung tâm bật tính năng này. */
export async function assertVocabEnabled(teacherId: string) {
  if (!(await isVocabEnabled(teacherId))) throw new LearningError(VOCAB_DISABLED_MESSAGE);
}
