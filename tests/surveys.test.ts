import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  answerFieldName,
  categoryAverages,
  isChoiceType,
  isPastClosingDay,
  MAX_TEXT_ANSWER,
  meetsThreshold,
  overallRating,
  parseOptionLines,
  parseSurveySubmission,
  summarizeChoices,
  summarizeNps,
  summarizeQuestion,
  summarizeRating,
  SURVEY_TEMPLATES,
  type QuestionDef,
  type ResponseRow
} from "../src/lib/survey-core";

const questions: QuestionDef[] = [
  { id: "r", type: "rating", prompt: "Phòng học", required: true, options: [] },
  { id: "n", type: "nps", prompt: "Giới thiệu", required: false, options: [] },
  { id: "s", type: "single", prompt: "Tốc độ", required: true, options: ["Chậm", "Vừa", "Nhanh"] },
  { id: "m", type: "multi", prompt: "Bổ sung", required: false, options: ["A", "B", "C"] },
  { id: "t", type: "text", prompt: "Góp ý", required: false, options: [] }
];

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseSurveySubmission", () => {
  test("reads every question type and skips blank optional ones", () => {
    const result = parseSurveySubmission(
      questions,
      "student",
      form([
        [answerFieldName("r"), "4"],
        [answerFieldName("s"), "1"],
        [answerFieldName("m"), "2"],
        [answerFieldName("m"), "0"],
        [answerFieldName("m"), "2"],
        [answerFieldName("t"), "  Phòng hơi nóng  "]
      ])
    );
    assert.ok(!("error" in result));
    assert.equal(result.respondentRole, "student");
    assert.deepEqual(result.answers, [
      { questionId: "r", value: 4, text: null, choices: [] },
      { questionId: "s", value: null, text: null, choices: [1] },
      { questionId: "m", value: null, text: null, choices: [0, 2] },
      { questionId: "t", value: null, text: "Phòng hơi nóng", choices: [] }
    ]);
  });

  test("rejects a missing required answer with the question number", () => {
    const result = parseSurveySubmission(questions, "student", form([[answerFieldName("r"), "5"]]));
    assert.deepEqual(result, { error: "Vui lòng trả lời câu 3: Tốc độ" });
  });

  test("rejects values outside the scale or option list", () => {
    for (const [field, value] of [
      ["r", "0"],
      ["r", "6"],
      ["r", "4.5"],
      ["n", "11"],
      ["s", "3"],
      ["s", "-1"]
    ]) {
      const values: Record<string, string> = { r: "3", s: "0", [field]: value };
      const result = parseSurveySubmission(
        questions,
        "student",
        form(Object.entries(values).map(([id, v]) => [answerFieldName(id), v]))
      );
      assert.ok("error" in result, `${field}=${value}`);
    }
  });

  test("allows only one choice on a single-choice question", () => {
    const result = parseSurveySubmission(
      questions,
      "student",
      form([
        [answerFieldName("r"), "3"],
        [answerFieldName("s"), "0"],
        [answerFieldName("s"), "1"]
      ])
    );
    assert.ok("error" in result);
  });

  test("caps free text length", () => {
    const result = parseSurveySubmission(
      questions,
      "student",
      form([
        [answerFieldName("r"), "3"],
        [answerFieldName("s"), "0"],
        [answerFieldName("t"), "x".repeat(MAX_TEXT_ANSWER + 1)]
      ])
    );
    assert.ok("error" in result);
  });

  test("asks who is answering when the survey targets both students and parents", () => {
    const base: [string, string][] = [
      [answerFieldName("r"), "3"],
      [answerFieldName("s"), "0"]
    ];
    assert.ok("error" in parseSurveySubmission(questions, "both", form(base)));
    assert.ok("error" in parseSurveySubmission(questions, "both", form([...base, ["respondentRole", "teacher"]])));
    const ok = parseSurveySubmission(questions, "both", form([...base, ["respondentRole", "parent"]]));
    assert.ok(!("error" in ok));
    assert.equal(ok.respondentRole, "parent");
  });

  test("refuses an empty ballot even when nothing is required", () => {
    const optional = questions.map((q) => ({ ...q, required: false }));
    assert.deepEqual(parseSurveySubmission(optional, "parent", form([])), { error: "Phiếu chưa có câu trả lời nào." });
  });
});

describe("summaries", () => {
  test("rating average and distribution", () => {
    assert.deepEqual(summarizeRating([5, 4, 4, 1]), { count: 4, average: 3.5, distribution: [1, 0, 0, 2, 1] });
    assert.equal(summarizeRating([]).average, null);
  });

  test("NPS is % promoters minus % detractors", () => {
    const result = summarizeNps([10, 9, 8, 7, 6, 0]);
    assert.equal(result.promoters, 2);
    assert.equal(result.passives, 2);
    assert.equal(result.detractors, 2);
    assert.equal(result.score, 0);
    assert.equal(summarizeNps([10, 10, 3]).score, 33);
    assert.equal(summarizeNps([]).score, null);
  });

  test("choice counts per option and respondents", () => {
    assert.deepEqual(summarizeChoices([[0, 2], [2], []], 3), { respondents: 2, counts: [1, 0, 2] });
  });

  test("small groups stay hidden", () => {
    assert.equal(meetsThreshold(2, 3), false);
    assert.equal(meetsThreshold(3, 3), true);
    assert.equal(meetsThreshold(1, 0), true);
  });

  const responses: ResponseRow[] = [
    {
      id: "a",
      classId: "c1",
      teacherName: "Cô Lan",
      respondentRole: "student",
      answers: [
        { questionId: "r", value: 5, text: null, choices: [], hidden: false },
        { questionId: "t", value: null, text: "Tốt", choices: [], hidden: false }
      ]
    },
    {
      id: "b",
      classId: "c2",
      teacherName: "Thầy Minh",
      respondentRole: "student",
      answers: [
        { questionId: "r", value: 2, text: null, choices: [], hidden: false },
        { questionId: "r2", value: 4, text: null, choices: [], hidden: false },
        { questionId: "t", value: null, text: "Ồn", choices: [], hidden: true }
      ]
    }
  ];
  const scored = [
    { id: "r", type: "rating" as const, category: "facilities" as const, options: [] },
    { id: "r2", type: "rating" as const, category: "teacher" as const, options: [] },
    { id: "t", type: "text" as const, category: "other" as const, options: [] }
  ];

  test("category averages use rating questions only", () => {
    assert.deepEqual(categoryAverages(scored, responses), [
      { category: "facilities", average: 3.5, count: 2 },
      { category: "teacher", average: 4, count: 1 }
    ]);
    assert.equal(overallRating(scored, responses), 11 / 3);
  });

  test("text summary keeps hidden comments flagged", () => {
    const summary = summarizeQuestion(scored[2], responses);
    assert.equal(summary.kind, "text");
    if (summary.kind !== "text") return;
    assert.deepEqual(
      summary.comments.map((c) => [c.text, c.hidden, c.classId]),
      [
        ["Tốt", false, "c1"],
        ["Ồn", true, "c2"]
      ]
    );
  });
});

describe("helpers", () => {
  test("option lines are trimmed and de-duplicated", () => {
    assert.deepEqual(parseOptionLines(" Ít \n\nVừa\nvừa\r\nNhiều"), ["Ít", "Vừa", "Nhiều"]);
  });

  test("closing day is inclusive in Vietnam dates", () => {
    assert.equal(isPastClosingDay("2026-10-20", "2026-10-20"), false);
    assert.equal(isPastClosingDay("2026-10-20", "2026-10-21"), true);
    assert.equal(isPastClosingDay(null, "2030-01-01"), false);
  });

  test("templates are well formed", () => {
    const keys = new Set(SURVEY_TEMPLATES.map((t) => t.key));
    assert.equal(keys.size, SURVEY_TEMPLATES.length);
    for (const template of SURVEY_TEMPLATES) {
      for (const question of template.questions) {
        if (isChoiceType(question.type)) assert.ok((question.options?.length ?? 0) >= 2, question.prompt);
        else assert.equal(question.options, undefined, question.prompt);
      }
    }
  });
});
