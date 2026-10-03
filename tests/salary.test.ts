import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeSalary } from "../src/lib/salary";

const at = (day: number) => new Date(2026, 9, day);

describe("computeSalary", () => {
  test("before settling, the whole share of collected tuition is due", () => {
    const salary = computeSalary({ collected: 4_000_000, classSharePercent: 40, records: [] });
    assert.deepEqual(salary, { mode: "percent", sharePercent: 40, due: 1_600_000, paidOut: 0, difference: 1_600_000 });
  });

  test("late payments for the same period show up as a top-up, not in another month", () => {
    const salary = computeSalary({
      collected: 5_000_000,
      classSharePercent: 40,
      records: [{ amount: 1_600_000, sharePercent: 40, createdAt: at(31) }]
    });
    assert.equal(salary.due, 2_000_000);
    assert.equal(salary.difference, 400_000);
  });

  test("a reversed payment after settling shows an overpayment to adjust", () => {
    const salary = computeSalary({
      collected: 3_000_000,
      classSharePercent: 40,
      records: [{ amount: 1_600_000, sharePercent: 40, createdAt: at(31) }]
    });
    assert.equal(salary.difference, -400_000);
  });

  test("the rate is locked by the first settlement of the period", () => {
    const salary = computeSalary({
      collected: 4_000_000,
      classSharePercent: 50,
      records: [
        { amount: 1_200_000, sharePercent: 30, createdAt: at(31) },
        { amount: 0, sharePercent: 50, createdAt: at(1) }
      ]
    });
    assert.equal(salary.sharePercent, 50);

    const locked = computeSalary({
      collected: 4_000_000,
      classSharePercent: 50,
      records: [{ amount: 1_200_000, sharePercent: 30, createdAt: at(1) }]
    });
    assert.equal(locked.sharePercent, 30);
    assert.equal(locked.difference, 0);
  });

  test("periods with manual salary records are not reconciled automatically", () => {
    const salary = computeSalary({
      collected: 4_000_000,
      classSharePercent: 40,
      records: [{ amount: 3_000_000, sharePercent: null, createdAt: at(5) }]
    });
    assert.equal(salary.mode, "manual");
    assert.equal(salary.difference, 0);
    assert.equal(salary.paidOut, 3_000_000);
  });
});
