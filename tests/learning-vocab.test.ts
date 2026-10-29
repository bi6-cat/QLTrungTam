import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { assignmentState } from "../src/modules/learning/assignments";
import { seededRng, shuffle } from "../src/modules/learning/random";
import { acceptedSpellings, isCorrectAnswer, normalizeTyped } from "../src/modules/learning/vocab/grading";
import { generateQuestions, quizConfigError, type QuizWord } from "../src/modules/learning/vocab/questions";
import { formatWordList, MAX_WORDS_PER_SET, parseWordList } from "../src/modules/learning/vocab/word-list";

describe("parseWordList", () => {
  test("reads the common ways teachers write a word list", () => {
    const { words, errors } = parseWordList(
      [
        "apple - quả táo",
        "banana: quả chuối",
        "cat = con mèo",
        "dog – con chó",
        "elephant (n) - con voi",
        "fly - (v) bay",
        "well-known - nổi tiếng",
        "get up - thức dậy | I get up at 6.",
        "",
        "# dòng ghi chú bị bỏ qua",
        "  green   apple  -   táo   xanh  "
      ].join("\n")
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(
      words.map((w) => [w.term, w.meaning, w.partOfSpeech, w.example]),
      [
        ["apple", "quả táo", null, null],
        ["banana", "quả chuối", null, null],
        ["cat", "con mèo", null, null],
        ["dog", "con chó", null, null],
        ["elephant", "con voi", "n", null],
        ["fly", "bay", "v", null],
        ["well-known", "nổi tiếng", null, null],
        ["get up", "thức dậy", null, "I get up at 6."],
        ["green apple", "táo xanh", null, null]
      ]
    );
  });

  test("reads rows pasted from Excel (tab-separated, 2–4 columns)", () => {
    const { words, errors } = parseWordList("apple\tquả táo\nrun\tchạy\tV\tI run every day.\nbook\tquyển sách\t\t");
    assert.deepEqual(errors, []);
    assert.deepEqual(words, [
      { term: "apple", meaning: "quả táo", partOfSpeech: null, example: null },
      { term: "run", meaning: "chạy", partOfSpeech: "v", example: "I run every day." },
      { term: "book", meaning: "quyển sách", partOfSpeech: null, example: null }
    ]);
  });

  test("splits at the earliest separator so the meaning may contain one", () => {
    const { words } = parseWordList("apple: quả táo - loại trái cây\nratio = tỉ lệ: a/b");
    assert.deepEqual(
      words.map((w) => [w.term, w.meaning]),
      [
        ["apple", "quả táo - loại trái cây"],
        ["ratio", "tỉ lệ: a/b"]
      ]
    );
  });

  test("reports bad lines and duplicates with their line numbers", () => {
    const { words, errors } = parseWordList("apple - quả táo\nbanana\n - không có từ\nApple - táo (lặp)\ncat - con mèo");
    assert.deepEqual(words.map((w) => w.term), ["apple", "cat"]);
    assert.deepEqual(
      errors.map((e) => e.message),
      [
        "Dòng 2: thiếu nghĩa (viết dạng: apple - quả táo).",
        "Dòng 3: thiếu nghĩa (viết dạng: apple - quả táo).",
        'Dòng 4: "Apple" trùng với dòng 1.'
      ]
    );
  });

  test("rejects a set larger than the limit", () => {
    const text = Array.from({ length: MAX_WORDS_PER_SET + 1 }, (_, i) => `word${i} - nghĩa ${i}`).join("\n");
    const { errors } = parseWordList(text);
    assert.match(errors.at(-1)!.message, /tối đa 300 từ/);
  });
});

const words: QuizWord[] = [
  { id: "w1", term: "apple", meaning: "quả táo", partOfSpeech: "n" },
  { id: "w2", term: "banana", meaning: "quả chuối", partOfSpeech: "n" },
  { id: "w3", term: "run", meaning: "chạy", partOfSpeech: "v" },
  { id: "w4", term: "big", meaning: "to, lớn", partOfSpeech: "adj" },
  { id: "w5", term: "large", meaning: "To,  lớn", partOfSpeech: "adj" },
  { id: "w6", term: "swim", meaning: "bơi", partOfSpeech: "v" },
  { id: "w7", term: "cat", meaning: "con mèo", partOfSpeech: "n" }
];

describe("quizConfigError", () => {
  test("explains each invalid configuration", () => {
    assert.match(quizConfigError(7, [], 5)!, /ít nhất một dạng/);
    assert.match(quizConfigError(0, ["type_term"], 1)!, /chưa có từ/);
    assert.match(quizConfigError(3, ["mc_meaning"], 3)!, /ít nhất 4 từ/);
    assert.equal(quizConfigError(3, ["type_term"], 3), null);
    assert.match(quizConfigError(7, ["type_term"], 0)!, /từ 1 trở lên/);
    assert.match(quizConfigError(7, ["mc_meaning", "type_term"], 15)!, /tối đa 14 câu/);
    assert.match(quizConfigError(300, ["mc_meaning"], 101)!, /Tối đa 100 câu/);
    assert.equal(quizConfigError(7, ["mc_meaning", "mc_term", "type_term"], 21), null);
  });
});

describe("generateQuestions", () => {
  test("builds the requested count with no repeated word-and-type pair", () => {
    const questions = generateQuestions(words, ["mc_meaning", "mc_term", "type_term"], 21, seededRng(1));
    assert.equal(questions.length, 21);
    const pairs = new Set(questions.map((q) => `${q.wordId}:${q.type}`));
    assert.equal(pairs.size, 21);
  });

  test("covers every word before repeating one", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const questions = generateQuestions(words, ["mc_meaning", "type_term"], 10, seededRng(seed));
      const perWord = new Map<string, number>();
      for (const q of questions) perWord.set(q.wordId, (perWord.get(q.wordId) ?? 0) + 1);
      assert.equal(perWord.size, 7, `seed ${seed}`);
      assert.ok([...perWord.values()].every((n) => n === 1 || n === 2), `seed ${seed}`);
    }
  });

  test("multiple choice has 4 distinct options with exactly one correct, never a synonym", () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const q of generateQuestions(words, ["mc_meaning", "mc_term"], 14, seededRng(seed))) {
        if (q.type === "type_term") continue;
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 4);
        assert.ok(q.options.includes(q.correctAnswer));
        if (q.wordId === "w4") assert.ok(!q.options.includes(q.type === "mc_term" ? "large" : "To,  lớn"));
        if (q.wordId === "w5") assert.ok(!q.options.includes(q.type === "mc_term" ? "big" : "to, lớn"));
      }
    }
  });

  test("prompts and answers point the right way", () => {
    const qs = generateQuestions(words, ["mc_meaning", "mc_term", "type_term"], 21, seededRng(3));
    const apple = (type: string) => qs.find((q) => q.wordId === "w1" && q.type === type)!;
    assert.deepEqual([apple("mc_meaning").prompt, apple("mc_meaning").correctAnswer], ["apple", "quả táo"]);
    assert.deepEqual([apple("mc_term").prompt, apple("mc_term").correctAnswer], ["quả táo", "apple"]);
    assert.deepEqual([apple("type_term").prompt, apple("type_term").correctAnswer, apple("type_term").options], ["quả táo", "apple", []]);
  });

  test("typed questions accept every synonym in the set", () => {
    const qs = generateQuestions(words, ["type_term"], 7, seededRng(4));
    assert.equal(qs.find((q) => q.wordId === "w4")!.correctAnswer, "big / large");
    assert.equal(qs.find((q) => q.wordId === "w5")!.correctAnswer, "large / big");
  });

  test("prefers distractors of the same part of speech", () => {
    const nouns: QuizWord[] = [
      ...["dog", "cat", "bird", "fish"].map((t, i) => ({ id: `n${i}`, term: t, meaning: `nghĩa ${t}`, partOfSpeech: "n" })),
      ...["eat", "run", "fly"].map((t, i) => ({ id: `v${i}`, term: t, meaning: `nghĩa ${t}`, partOfSpeech: "v" }))
    ];
    for (let seed = 1; seed <= 10; seed++) {
      const q = generateQuestions(nouns, ["mc_term"], 7, seededRng(seed)).find((x) => x.wordId === "n0")!;
      assert.deepEqual([...q.options].sort(), ["bird", "cat", "dog", "fish"], `seed ${seed}`);
    }
  });

  test("falls back to a typed question when every other word is a synonym", () => {
    const synonyms: QuizWord[] = ["big", "large", "huge", "great"].map((t, i) => ({ id: `s${i}`, term: t, meaning: "to lớn", partOfSpeech: null }));
    const qs = generateQuestions(synonyms, ["mc_term"], 4, seededRng(5));
    assert.ok(qs.every((q) => q.type === "type_term" && q.options.length === 0));
  });

  test("same seed gives the same quiz; different seeds shuffle", () => {
    const a = generateQuestions(words, ["mc_meaning", "type_term"], 10, seededRng(42));
    const b = generateQuestions(words, ["mc_meaning", "type_term"], 10, seededRng(42));
    const c = generateQuestions(words, ["mc_meaning", "type_term"], 10, seededRng(43));
    assert.deepEqual(a, b);
    assert.notDeepEqual(a, c);
  });

  test("throws on an invalid configuration", () => {
    assert.throws(() => generateQuestions(words.slice(0, 3), ["mc_meaning"], 3, seededRng(1)), /ít nhất 4 từ/);
  });
});

describe("grading", () => {
  test("typed answers ignore case, spacing, curly quotes and a trailing full stop", () => {
    assert.equal(normalizeTyped("  Don’t   Worry. "), "don't worry");
    const q = { type: "type_term" as const, options: [], correctAnswer: "don't worry" };
    for (const answer of ["don't worry", "DON’T WORRY", " don't  worry!"]) assert.equal(isCorrectAnswer(q, answer), true, answer);
    for (const answer of ["dont worry", "don't", "", null]) assert.equal(isCorrectAnswer(q, answer), false, String(answer));
  });

  test("slash-separated spellings are all accepted", () => {
    assert.deepEqual(acceptedSpellings("colour / color"), ["colour", "color"]);
    const q = { type: "type_term" as const, options: [], correctAnswer: "colour / color" };
    assert.equal(isCorrectAnswer(q, "Color"), true);
    assert.equal(isCorrectAnswer(q, "colour / color"), false);
  });

  test("a multiple-choice answer must be the correct option exactly", () => {
    const q = { type: "mc_meaning" as const, options: ["quả táo", "con mèo", "chạy", "bơi"], correctAnswer: "quả táo" };
    assert.equal(isCorrectAnswer(q, "quả táo"), true);
    assert.equal(isCorrectAnswer(q, "con mèo"), false);
    assert.equal(isCorrectAnswer(q, "Quả táo"), false);
    assert.equal(isCorrectAnswer({ ...q, options: ["con mèo"] }, "quả táo"), false);
  });
});

describe("assignmentState", () => {
  const now = new Date("2026-11-01T10:00:00Z");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  test("upcoming, open, closed by due date or by hand", () => {
    assert.equal(assignmentState({ opensAt: at(5), dueAt: null, closedAt: null }, now), "upcoming");
    assert.equal(assignmentState({ opensAt: at(-5), dueAt: at(5), closedAt: null }, now), "open");
    assert.equal(assignmentState({ opensAt: at(-5), dueAt: at(0), closedAt: null }, now), "closed");
    assert.equal(assignmentState({ opensAt: at(-5), dueAt: null, closedAt: at(-1) }, now), "closed");
  });
});

describe("shuffle", () => {
  test("keeps every item and leaves the input untouched", () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input, seededRng(9));
    assert.deepEqual([...out].sort(), input);
    assert.deepEqual(input, [1, 2, 3, 4, 5]);
  });
});

describe("formatWordList", () => {
  test("round-trips through parseWordList", () => {
    const text = "apple (n) - quả táo | I eat an apple.\nwell-known - nổi tiếng\nratio - tỉ lệ: a/b";
    const { words } = parseWordList(text);
    assert.deepEqual(parseWordList(formatWordList(words)).words, words);
  });
});
