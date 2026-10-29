import { shuffle, type Rng } from "../random";

export const QUESTION_TYPES = ["mc_meaning", "mc_term", "type_term"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  mc_meaning: "Chọn nghĩa của từ",
  mc_term: "Chọn từ đúng với nghĩa",
  type_term: "Gõ từ theo nghĩa"
};

export const MAX_QUESTIONS = 100;
/** Trắc nghiệm cần ít nhất 4 từ để có 3 phương án nhiễu. */
export const MIN_WORDS_FOR_CHOICE = 4;
const OPTION_COUNT = 4;

export type QuizWord = { id: string; term: string; meaning: string; partOfSpeech: string | null };

export type GeneratedQuestion = {
  wordId: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctAnswer: string;
};

export function isQuestionType(value: string): value is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(value);
}

const optionKey = (value: string) => value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** Lỗi cấu hình bài (tiếng Việt, hiện cho giáo viên); null nếu hợp lệ. */
export function quizConfigError(wordCount: number, types: readonly QuestionType[], questionCount: number) {
  if (types.length === 0) return "Chọn ít nhất một dạng câu hỏi.";
  if (wordCount === 0) return "Bộ từ chưa có từ nào.";
  if (types.some((t) => t !== "type_term") && wordCount < MIN_WORDS_FOR_CHOICE) {
    return `Câu trắc nghiệm cần bộ có ít nhất ${MIN_WORDS_FOR_CHOICE} từ (bộ này có ${wordCount}). Bỏ dạng trắc nghiệm hoặc thêm từ.`;
  }
  if (!Number.isInteger(questionCount) || questionCount < 1) return "Số câu phải từ 1 trở lên.";
  if (questionCount > MAX_QUESTIONS) return `Tối đa ${MAX_QUESTIONS} câu một bài.`;
  const max = wordCount * types.length;
  if (questionCount > max) return `Bộ ${wordCount} từ với ${types.length} dạng câu chỉ ra được tối đa ${max} câu khác nhau.`;
  return null;
}

/**
 * Phương án nhiễu: nghĩa (hoặc từ) của các từ khác. Bỏ từ đồng nghĩa (cùng nghĩa với đáp án) và
 * phương án trùng chữ để không có hai đáp án đúng; ưu tiên cùng từ loại cho khó đoán hơn.
 */
function distractors(word: QuizWord, words: readonly QuizWord[], field: "meaning" | "term", rng: Rng) {
  const meaning = optionKey(word.meaning);
  const seen = new Set([optionKey(word[field])]);
  const candidates: QuizWord[] = [];
  for (const other of shuffle(words, rng)) {
    const key = optionKey(other[field]);
    if (other.id === word.id || seen.has(key) || optionKey(other.meaning) === meaning) continue;
    seen.add(key);
    candidates.push(other);
  }
  const samePos = (w: QuizWord) => Boolean(word.partOfSpeech) && w.partOfSpeech === word.partOfSpeech;
  return [...candidates.filter(samePos), ...candidates.filter((w) => !samePos(w))]
    .slice(0, OPTION_COUNT - 1)
    .map((w) => w[field]);
}

/** Câu gõ từ: mọi từ cùng nghĩa trong bộ đều là đáp án đúng (vd "big / large" cho "to, lớn"). */
function typedQuestion(word: QuizWord, words: readonly QuizWord[]): GeneratedQuestion {
  const meaning = optionKey(word.meaning);
  const synonyms = words.filter((w) => w.id !== word.id && optionKey(w.meaning) === meaning).map((w) => w.term);
  return { wordId: word.id, type: "type_term", prompt: word.meaning, options: [], correctAnswer: [word.term, ...synonyms].join(" / ") };
}

function buildQuestion(word: QuizWord, type: QuestionType, words: readonly QuizWord[], rng: Rng): GeneratedQuestion {
  if (type === "type_term") return typedQuestion(word, words);
  const field = type === "mc_meaning" ? "meaning" : "term";
  const others = distractors(word, words, field, rng);
  // Cả bộ toàn từ đồng nghĩa với từ này: không dựng được trắc nghiệm, chuyển sang gõ từ.
  if (others.length === 0) return typedQuestion(word, words);
  const correctAnswer = word[field];
  return {
    wordId: word.id,
    type,
    prompt: type === "mc_meaning" ? word.term : word.meaning,
    options: shuffle([correctAnswer, ...others], rng),
    correctAnswer
  };
}

/**
 * Đề gồm `count` câu: phủ đều các từ trước khi lặp lại một từ, và không có hai câu cùng từ cùng
 * dạng (lần lặp thứ k của một từ dùng dạng lệch k bậc). Thứ tự câu được trộn.
 */
export function generateQuestions(words: readonly QuizWord[], types: readonly QuestionType[], count: number, rng: Rng) {
  const error = quizConfigError(words.length, types, count);
  if (error) throw new Error(error);
  const order = shuffle(words, rng);
  const typeOffset = Math.floor(rng() * types.length);
  const questions: GeneratedQuestion[] = [];
  for (let i = 0; i < count; i++) {
    const wordIndex = i % order.length;
    const round = Math.floor(i / order.length);
    const type = types[(wordIndex + round + typeOffset) % types.length];
    questions.push(buildQuestion(order[wordIndex], type, words, rng));
  }
  return shuffle(questions, rng);
}
