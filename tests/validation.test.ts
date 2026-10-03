import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { createClassSchema, salaryPayoutSchema, updateClassSchema } from "../src/lib/validation";

const classInput = {
  name: "Toán 12",
  shortCode: "t12a",
  teacherName: "Cô Hằng",
  pricePerSession: "150000",
  sessionsPerMonthDefault: "8",
  teacherSharePercent: "75"
};

describe("class validation", () => {
  test("a blank teacher share is rejected instead of silently becoming 0%", () => {
    const result = updateClassSchema.safeParse({ ...classInput, id: "c1", teacherSharePercent: "" });
    assert.equal(result.success, false);
    const ok = updateClassSchema.safeParse({ ...classInput, id: "c1", teacherSharePercent: "0" });
    assert.equal(ok.success, true);
  });

  test("a class salary cutoff is optional but must be a known code", () => {
    assert.equal(createClassSchema.safeParse({ ...classInput, salaryCutoff: "" }).data?.salaryCutoff, null);
    assert.equal(createClassSchema.safeParse({ ...classInput, salaryCutoff: "next:5" }).data?.salaryCutoff, "next:5");
    assert.equal(createClassSchema.safeParse({ ...classInput, salaryCutoff: "next:45" }).success, false);
  });

  test("class codes only allow letters and digits because they go into bank memos", () => {
    assert.equal(createClassSchema.safeParse(classInput).data?.shortCode, "T12A");
    assert.equal(createClassSchema.safeParse({ ...classInput, shortCode: "T12-A" }).success, false);
    assert.equal(createClassSchema.safeParse({ ...classInput, shortCode: "T12_A" }).success, false);
  });
});

describe("salary payout validation", () => {
  const lines = (value: unknown) => JSON.stringify(value);

  test("accepts several class-months, including a negative correction", () => {
    const result = salaryPayoutSchema.safeParse({
      paidAt: "2026-10-05",
      note: "",
      lines: lines([
        { classId: "c1", month: 9, year: 2026, amount: 360_000 },
        { classId: "c2", month: 9, year: 2026, amount: -120_000, method: "cash" }
      ])
    });
    assert.equal(result.success, true);
    assert.equal(result.data?.note, null);
    assert.deepEqual(result.data?.lines.map((line) => line.method), ["bank_transfer", "cash"]);
  });

  test("rejects zero amounts, empty selections and broken payloads", () => {
    assert.equal(
      salaryPayoutSchema.safeParse({ paidAt: "2026-10-05", lines: lines([{ classId: "c1", month: 9, year: 2026, amount: 0 }]) }).success,
      false
    );
    assert.equal(salaryPayoutSchema.safeParse({ paidAt: "2026-10-05", lines: "[]" }).success, false);
    assert.equal(salaryPayoutSchema.safeParse({ paidAt: "2026-10-05", lines: "{oops" }).success, false);
    assert.equal(salaryPayoutSchema.safeParse({ paidAt: "05/10/2026", lines: "[]" }).success, false);
  });
});
