import type { QuestionType } from "./questions";

/** Chuẩn hoá câu gõ: bỏ hoa/thường, khoảng trắng thừa, dấu câu cuối; thống nhất kiểu dấu nháy. */
export function normalizeTyped(value: string) {
  return value
    .normalize("NFC")
    .replace(/[‘’`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/, "")
    .toLowerCase();
}

/** Từ có nhiều cách viết thì giáo viên ghi "colour / color": gõ cách nào cũng đúng. */
export function acceptedSpellings(term: string) {
  return term
    .split("/")
    .map(normalizeTyped)
    .filter(Boolean);
}

export function isCorrectAnswer(question: { type: QuestionType; options: readonly string[]; correctAnswer: string }, answer: string | null | undefined) {
  if (answer == null) return false;
  if (question.type === "type_term") return acceptedSpellings(question.correctAnswer).includes(normalizeTyped(answer));
  // Trắc nghiệm: phải là đúng một phương án của câu, và là đáp án.
  return question.options.includes(answer) && answer === question.correctAnswer;
}
