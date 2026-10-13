// Phần thuần của tính năng khảo sát (không prisma, không next): nhãn, mẫu câu hỏi, kiểm tra
// phiếu nộp và các phép tổng hợp kết quả. Dùng chung cho trang admin, trang công khai và test.

export const SURVEY_STATUSES = ["draft", "open", "closed"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const SURVEY_AUDIENCES = ["student", "parent", "both"] as const;
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number];

export const SURVEY_RESPONDENTS = ["student", "parent"] as const;
export type SurveyRespondent = (typeof SURVEY_RESPONDENTS)[number];

export const QUESTION_TYPES = ["rating", "nps", "single", "multi", "text"] as const;
export type SurveyQuestionType = (typeof QUESTION_TYPES)[number];

export const SURVEY_CATEGORIES = ["facilities", "teacher", "curriculum", "center", "other"] as const;
export type SurveyCategory = (typeof SURVEY_CATEGORIES)[number];

export const STATUS_LABEL: Record<SurveyStatus, string> = {
  draft: "Nháp",
  open: "Đang mở",
  closed: "Đã đóng"
};

export const AUDIENCE_LABEL: Record<SurveyAudience, string> = {
  student: "Học sinh",
  parent: "Phụ huynh",
  both: "Học sinh & phụ huynh"
};

export const RESPONDENT_LABEL: Record<SurveyRespondent, string> = {
  student: "Học sinh",
  parent: "Phụ huynh"
};

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  rating: "Chấm sao 1–5",
  nps: "Mức sẵn sàng giới thiệu 0–10",
  single: "Chọn một",
  multi: "Chọn nhiều",
  text: "Tự viết"
};

export const CATEGORY_LABEL: Record<SurveyCategory, string> = {
  facilities: "Cơ sở vật chất",
  teacher: "Giáo viên",
  curriculum: "Chương trình",
  center: "Trung tâm",
  other: "Khác"
};

export const MAX_TEXT_ANSWER = 2000;
export const MAX_OPTIONS = 12;
export const DEFAULT_MIN_GROUP_SIZE = 1;

export function isChoiceType(type: SurveyQuestionType) {
  return type === "single" || type === "multi";
}

// ---------------------------------------------------------------------------
// Mẫu khảo sát
// ---------------------------------------------------------------------------

export type TemplateQuestion = {
  type: SurveyQuestionType;
  category: SurveyCategory;
  prompt: string;
  required?: boolean;
  options?: string[];
};

export type SurveyTemplate = {
  key: string;
  title: string;
  description: string;
  audience: SurveyAudience;
  questions: TemplateQuestion[];
};

const commentQuestion = (category: SurveyCategory, prompt: string): TemplateQuestion => ({
  type: "text",
  category,
  prompt,
  required: false
});

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: "facilities",
    title: "Đánh giá cơ sở vật chất",
    description: "Giúp trung tâm biết phòng học, thiết bị và tiện ích nào cần cải thiện.",
    audience: "student",
    questions: [
      { type: "rating", category: "facilities", prompt: "Phòng học sạch sẽ, thoáng mát" },
      { type: "rating", category: "facilities", prompt: "Ánh sáng, bàn ghế phù hợp để học" },
      { type: "rating", category: "facilities", prompt: "Điều hòa, quạt hoạt động tốt" },
      { type: "rating", category: "facilities", prompt: "Bảng, máy chiếu và thiết bị dạy học" },
      { type: "rating", category: "facilities", prompt: "Nhà vệ sinh sạch sẽ" },
      { type: "rating", category: "facilities", prompt: "Chỗ để xe thuận tiện, an toàn" },
      commentQuestion("facilities", "Em muốn trung tâm cải thiện điều gì về cơ sở vật chất?")
    ]
  },
  {
    key: "teacher",
    title: "Đánh giá giáo viên",
    description: "Mỗi lớp nhận link riêng, kết quả tự gắn với giáo viên của lớp đó.",
    audience: "student",
    questions: [
      { type: "rating", category: "teacher", prompt: "Thầy/cô giảng bài dễ hiểu" },
      { type: "rating", category: "teacher", prompt: "Thầy/cô chuẩn bị bài kỹ, có tài liệu rõ ràng" },
      { type: "rating", category: "teacher", prompt: "Thầy/cô chữa bài và giải đáp thắc mắc chu đáo" },
      { type: "rating", category: "teacher", prompt: "Thầy/cô quan tâm, động viên học sinh" },
      { type: "rating", category: "teacher", prompt: "Thầy/cô vào lớp đúng giờ, dạy đủ thời lượng" },
      {
        type: "single",
        category: "teacher",
        prompt: "Tốc độ giảng bài của thầy/cô",
        options: ["Quá chậm", "Vừa phải", "Quá nhanh"]
      },
      commentQuestion("teacher", "Điều em thích nhất ở cách dạy của thầy/cô?"),
      commentQuestion("teacher", "Em mong thầy/cô thay đổi hoặc bổ sung điều gì?")
    ]
  },
  {
    key: "curriculum",
    title: "Đánh giá chương trình học",
    description: "Nội dung, bài tập và mức độ tiến bộ của học sinh.",
    audience: "student",
    questions: [
      { type: "rating", category: "curriculum", prompt: "Nội dung học bám sát chương trình trên trường" },
      { type: "rating", category: "curriculum", prompt: "Bài tập và đề luyện có ích cho việc thi cử" },
      { type: "rating", category: "curriculum", prompt: "Em thấy mình tiến bộ sau khi học" },
      {
        type: "single",
        category: "curriculum",
        prompt: "Lượng bài tập về nhà",
        options: ["Ít", "Vừa đủ", "Nhiều"]
      },
      {
        type: "multi",
        category: "curriculum",
        prompt: "Em muốn lớp học bổ sung thêm",
        required: false,
        options: ["Luyện đề", "Ôn lại lý thuyết", "Kiểm tra định kỳ", "Học nhóm", "Bài nâng cao"]
      },
      commentQuestion("curriculum", "Góp ý khác về chương trình học")
    ]
  },
  {
    key: "center",
    title: "Mức độ hài lòng với trung tâm",
    description: "Đánh giá chung về trung tâm và mức sẵn sàng giới thiệu cho người khác.",
    audience: "both",
    questions: [
      {
        type: "nps",
        category: "center",
        prompt: "Bạn sẵn sàng giới thiệu trung tâm cho bạn bè, người thân ở mức nào?"
      },
      { type: "rating", category: "center", prompt: "Mức độ hài lòng chung với trung tâm" },
      { type: "rating", category: "center", prompt: "Thông báo lịch học, học phí rõ ràng, kịp thời" },
      { type: "rating", category: "center", prompt: "Thái độ của quản lý và nhân viên" },
      { type: "rating", category: "center", prompt: "Học phí hợp lý so với chất lượng" },
      commentQuestion("center", "Trung tâm cần làm gì để tốt hơn?")
    ]
  },
  {
    key: "blank",
    title: "Khảo sát trống",
    description: "Tự soạn câu hỏi từ đầu.",
    audience: "student",
    questions: []
  }
];

export function findSurveyTemplate(key: string) {
  return SURVEY_TEMPLATES.find((template) => template.key === key) ?? null;
}

// ---------------------------------------------------------------------------
// Kiểm tra phiếu nộp
// ---------------------------------------------------------------------------

export type QuestionDef = {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  options: string[];
};

export type ParsedAnswer = {
  questionId: string;
  value: number | null;
  text: string | null;
  choices: number[];
};

/** Tên ô form của câu hỏi trên trang khảo sát công khai. */
export function answerFieldName(questionId: string) {
  return `q_${questionId}`;
}

type FormLike = { get(name: string): unknown; getAll(name: string): unknown[] };

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseIntInRange(raw: string, min: number, max: number) {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

/**
 * Đọc và kiểm tra phiếu từ form. Câu không bắt buộc bỏ trống thì không tạo câu trả lời.
 * Giá trị sai (ngoài thang điểm, lựa chọn không tồn tại) bị từ chối thay vì bỏ qua lặng lẽ.
 */
export function parseSurveySubmission(
  questions: QuestionDef[],
  audience: SurveyAudience,
  form: FormLike
): { answers: ParsedAnswer[]; respondentRole: SurveyRespondent } | { error: string } {
  let respondentRole: SurveyRespondent;
  if (audience === "both") {
    const role = asTrimmedString(form.get("respondentRole"));
    if (role !== "student" && role !== "parent") {
      return { error: "Vui lòng chọn bạn là học sinh hay phụ huynh." };
    }
    respondentRole = role;
  } else {
    respondentRole = audience;
  }

  const answers: ParsedAnswer[] = [];
  for (const [index, question] of questions.entries()) {
    const field = answerFieldName(question.id);
    const label = `câu ${index + 1}`;
    let answer: ParsedAnswer | null = null;

    if (question.type === "rating" || question.type === "nps") {
      const raw = asTrimmedString(form.get(field));
      if (raw) {
        const value = question.type === "rating" ? parseIntInRange(raw, 1, 5) : parseIntInRange(raw, 0, 10);
        if (value === null) return { error: `Điểm của ${label} không hợp lệ.` };
        answer = { questionId: question.id, value, text: null, choices: [] };
      }
    } else if (question.type === "single" || question.type === "multi") {
      const raws = form
        .getAll(field)
        .map(asTrimmedString)
        .filter(Boolean);
      if (raws.length > 0) {
        if (question.type === "single" && raws.length > 1) return { error: `${label} chỉ được chọn một đáp án.` };
        const choices: number[] = [];
        for (const raw of raws) {
          const choice = parseIntInRange(raw, 0, question.options.length - 1);
          if (choice === null) return { error: `Lựa chọn của ${label} không hợp lệ.` };
          if (!choices.includes(choice)) choices.push(choice);
        }
        choices.sort((a, b) => a - b);
        answer = { questionId: question.id, value: null, text: null, choices };
      }
    } else {
      const text = asTrimmedString(form.get(field));
      if (text.length > MAX_TEXT_ANSWER) {
        return { error: `Câu trả lời ${label} dài quá ${MAX_TEXT_ANSWER} ký tự.` };
      }
      if (text) answer = { questionId: question.id, value: null, text, choices: [] };
    }

    if (answer) answers.push(answer);
    else if (question.required) return { error: `Vui lòng trả lời ${label}: ${question.prompt}` };
  }

  if (answers.length === 0) return { error: "Phiếu chưa có câu trả lời nào." };
  return { answers, respondentRole };
}

/** Lựa chọn nhập trong ô nhiều dòng của trình soạn câu hỏi: mỗi dòng một lựa chọn. */
export function parseOptionLines(raw: string) {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const option = line.trim().slice(0, 200);
    const key = option.toLowerCase();
    if (!option || seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }
  return options;
}

// ---------------------------------------------------------------------------
// Tổng hợp kết quả
// ---------------------------------------------------------------------------

export function average(values: number[]) {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Nhóm (lớp, giáo viên, đối tượng) chỉ hiện kết quả khi đủ số phiếu, tránh đoán ra người trả lời. */
export function meetsThreshold(count: number, minGroupSize: number) {
  return count >= Math.max(1, minGroupSize);
}

export function summarizeRating(values: number[]) {
  const distribution = [0, 0, 0, 0, 0];
  for (const value of values) {
    if (value >= 1 && value <= 5) distribution[value - 1] += 1;
  }
  return { count: values.length, average: average(values), distribution };
}

/**
 * Điểm giới thiệu (NPS): % người chấm 9–10 trừ % người chấm 0–6, từ -100 đến 100.
 */
export function summarizeNps(values: number[]) {
  const distribution = Array.from({ length: 11 }, () => 0);
  let promoters = 0;
  let detractors = 0;
  for (const value of values) {
    if (value < 0 || value > 10) continue;
    distribution[value] += 1;
    if (value >= 9) promoters += 1;
    else if (value <= 6) detractors += 1;
  }
  const count = values.length;
  const passives = count - promoters - detractors;
  const score = count === 0 ? null : Math.round(((promoters - detractors) / count) * 100);
  return { count, score, promoters, passives, detractors, distribution };
}

export function summarizeChoices(choiceLists: number[][], optionCount: number) {
  const counts = Array.from({ length: optionCount }, () => 0);
  let respondents = 0;
  for (const choices of choiceLists) {
    if (choices.length === 0) continue;
    respondents += 1;
    for (const choice of choices) {
      if (choice >= 0 && choice < optionCount) counts[choice] += 1;
    }
  }
  return { respondents, counts };
}

/** Điểm hiển thị một chữ số thập phân kiểu Việt Nam, vd 4,3. */
export function formatScore(value: number | null, digits = 1) {
  if (value === null) return "—";
  return value.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(part: number, total: number) {
  if (total <= 0) return "—";
  return `${Math.round((part / total) * 100)}%`;
}

/** Ngày cuối nhận phiếu đã qua chưa, so theo ngày giờ Việt Nam ("YYYY-MM-DD"). */
export function isPastClosingDay(closesOnIso: string | null, todayIso: string) {
  return closesOnIso !== null && todayIso > closesOnIso;
}

export type ResponseAnswerRow = {
  questionId: string;
  value: number | null;
  text: string | null;
  choices: number[];
  hidden: boolean;
};

export type ResponseRow = {
  id: string;
  classId: string | null;
  teacherName: string;
  respondentRole: SurveyRespondent;
  answers: ResponseAnswerRow[];
};

export type QuestionSummary =
  | ({ kind: "rating" } & ReturnType<typeof summarizeRating>)
  | ({ kind: "nps" } & ReturnType<typeof summarizeNps>)
  | ({ kind: "choice" } & ReturnType<typeof summarizeChoices>)
  | {
      kind: "text";
      comments: { responseId: string; classId: string | null; text: string; hidden: boolean }[];
    };

export function summarizeQuestion(
  question: { id: string; type: SurveyQuestionType; options: string[] },
  responses: ResponseRow[]
): QuestionSummary {
  const rows = responses.flatMap((response) =>
    response.answers
      .filter((answer) => answer.questionId === question.id)
      .map((answer) => ({ response, answer }))
  );
  const values = rows.map((row) => row.answer.value).filter((value): value is number => value !== null);
  switch (question.type) {
    case "rating":
      return { kind: "rating", ...summarizeRating(values) };
    case "nps":
      return { kind: "nps", ...summarizeNps(values) };
    case "single":
    case "multi":
      return {
        kind: "choice",
        ...summarizeChoices(
          rows.map((row) => row.answer.choices),
          question.options.length
        )
      };
    case "text":
      return {
        kind: "text",
        comments: rows
          .filter((row) => row.answer.text)
          .map((row) => ({
            responseId: row.response.id,
            classId: row.response.classId,
            text: row.answer.text ?? "",
            hidden: row.answer.hidden
          }))
      };
  }
}

/** Điểm sao trung bình theo nhóm đánh giá (chỉ câu chấm sao). */
export function categoryAverages(
  questions: { id: string; type: SurveyQuestionType; category: SurveyCategory }[],
  responses: ResponseRow[]
) {
  const categoryOf = new Map(
    questions.filter((question) => question.type === "rating").map((question) => [question.id, question.category])
  );
  const values = new Map<SurveyCategory, number[]>();
  for (const response of responses) {
    for (const answer of response.answers) {
      const category = categoryOf.get(answer.questionId);
      if (!category || answer.value === null) continue;
      values.set(category, [...(values.get(category) ?? []), answer.value]);
    }
  }
  return SURVEY_CATEGORIES.filter((category) => values.has(category)).map((category) => {
    const list = values.get(category) ?? [];
    return { category, average: average(list), count: list.length };
  });
}

/** Điểm sao trung bình của mọi câu chấm sao trong các phiếu. */
export function overallRating(
  questions: { id: string; type: SurveyQuestionType }[],
  responses: ResponseRow[]
) {
  const ratingIds = new Set(questions.filter((question) => question.type === "rating").map((question) => question.id));
  return average(
    responses.flatMap((response) =>
      response.answers
        .filter((answer) => ratingIds.has(answer.questionId) && answer.value !== null)
        .map((answer) => answer.value as number)
    )
  );
}
