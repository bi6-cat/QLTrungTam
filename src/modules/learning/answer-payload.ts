import { MAX_QUESTIONS } from "./vocab/questions";

const MAX_ANSWER_CHARS = 200;

/**
 * Câu trả lời trình duyệt gửi lên ({ "vị trí câu": "câu trả lời" }) → Map cho submitAttempt.
 * Dữ liệu từ máy học sinh nên kiểm kỹ: sai dạng thì null, bỏ câu trống, cắt câu quá dài.
 */
export function parseAnswerPayload(value: unknown): Map<number, string> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_QUESTIONS) return null;
  const answers = new Map<number, string>();
  for (const [key, answer] of entries) {
    if (!/^[1-9]\d{0,2}$/.test(key) || typeof answer !== "string") return null;
    if (answer.trim()) answers.set(Number(key), answer.slice(0, MAX_ANSWER_CHARS));
  }
  return answers;
}
