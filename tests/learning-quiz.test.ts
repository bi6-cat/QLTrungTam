import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatCountdown, secondsLeft } from "../src/components/learning/quiz-clock";
import { parseAnswerPayload } from "../src/modules/learning/answer-payload";

describe("parseAnswerPayload", () => {
  test("keeps answered questions keyed by position", () => {
    const answers = parseAnswerPayload({ "1": "apple", "2": "  ", "10": "quả táo" });
    assert.deepEqual([...answers!], [[1, "apple"], [10, "quả táo"]]);
  });

  test("rejects anything that is not a plain map of position to text", () => {
    for (const bad of [null, "x", 3, [], ["a"], { "0": "a" }, { "-1": "a" }, { "1.5": "a" }, { abc: "a" }, { "1": 5 }, { "01": "a" }]) {
      assert.equal(parseAnswerPayload(bad), null, JSON.stringify(bad));
    }
  });

  test("caps the number of answers and the length of each", () => {
    const tooMany = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i + 1), "a"]));
    assert.equal(parseAnswerPayload(tooMany), null);
    assert.equal(parseAnswerPayload({ "1": "x".repeat(500) })!.get(1)!.length, 200);
  });
});

describe("quiz clock", () => {
  test("formats the countdown", () => {
    assert.equal(formatCountdown(0), "00:00");
    assert.equal(formatCountdown(-5), "00:00");
    assert.equal(formatCountdown(59.2), "01:00");
    assert.equal(formatCountdown(605), "10:05");
    assert.equal(formatCountdown(3 * 3600 + 7), "3:00:07");
  });

  test("counts time left by the server clock even when the device clock is off", () => {
    const endsAt = 1_000_000;
    // Máy học sinh chạy chậm 30 giây so với máy chủ.
    assert.equal(secondsLeft(endsAt, 30_000, 900_000), 70);
    assert.equal(secondsLeft(endsAt, 0, 1_010_000), -10);
  });
});
