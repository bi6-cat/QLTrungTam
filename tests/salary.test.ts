import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildSalaryLedger, buildTeacherSalaryMessage, computeSalary, salaryStatus, type LedgerInput } from "../src/lib/salary";

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

const SEP = periodIndexOf(9, 2026);
const OCT = periodIndexOf(10, 2026);

function periodIndexOf(month: number, year: number) {
  return year * 12 + (month - 1);
}

function ledgerInput(overrides: Partial<LedgerInput> = {}): LedgerInput {
  return {
    fromIndex: SEP,
    toIndex: OCT,
    classes: [
      { id: "c1", name: "Văn 9", shortCode: "26V9A", teacherName: "Cô Hương", teacherSharePercent: 75, archivedAt: null }
    ],
    invoices: [],
    records: [],
    ...overrides
  };
}

const invoice = (
  id: string,
  status: "paid" | "unpaid",
  amount: number,
  paidAt: Date | null = null,
  month = 9
): LedgerInput["invoices"][number] => ({
  id,
  classId: "c1",
  month,
  year: 2026,
  status,
  amount,
  paidAmount: status === "paid" ? amount : null,
  paidAt,
  studentName: `HS ${id}`
});

const payout = (id: string, amount: number, paidAt: Date, month = 9): LedgerInput["records"][number] => ({
  id,
  classId: "c1",
  month,
  year: 2026,
  amount,
  sharePercent: 75,
  baseAmount: null,
  description: "",
  note: null,
  paidAt,
  createdAt: paidAt
});

describe("buildSalaryLedger", () => {
  test("a partial transfer leaves the rest owed in the same month, late payers are named", () => {
    const [teacher] = buildSalaryLedger(
      ledgerInput({
        invoices: [
          invoice("a", "paid", 4_000_000, new Date(2026, 8, 5)),
          invoice("b", "paid", 480_000, new Date(2026, 9, 12)),
          invoice("c", "unpaid", 480_000)
        ],
        records: [payout("p1", 2_500_000, new Date(2026, 9, 1))]
      })
    );
    assert.equal(teacher.teacherName, "Cô Hương");
    const [september] = teacher.classes[0].periods;
    assert.equal(september.due, 3_360_000);
    assert.equal(september.paidOut, 2_500_000);
    assert.equal(september.difference, 860_000);
    assert.deepEqual(september.latePayers.map((item) => item.studentName), ["HS b"]);
    assert.deepEqual(september.waiting.map((item) => item.studentName), ["HS c"]);
    assert.equal(september.waitingShare, 360_000);
    assert.equal(september.status.key, "partial");
    assert.equal(teacher.owed, 860_000);
    assert.equal(teacher.openPeriods, 1);
  });

  test("months without tuition or transfers are skipped and classes without a share are ignored", () => {
    const ledger = buildSalaryLedger(
      ledgerInput({
        classes: [
          { id: "c1", name: "Văn 9", shortCode: "26V9A", teacherName: "Cô Hương", teacherSharePercent: 75, archivedAt: null },
          { id: "c2", name: "Lớp tự học", shortCode: "TH", teacherName: "", teacherSharePercent: 0, archivedAt: null }
        ],
        invoices: [invoice("a", "paid", 1_000_000, new Date(2026, 9, 3), 10)]
      })
    );
    assert.equal(ledger.length, 1);
    assert.deepEqual(
      ledger[0].classes[0].periods.map((period) => period.month),
      [10]
    );
  });

  test("a top-up for late payers closes the month and the message lists both transfers", () => {
    const [teacher] = buildSalaryLedger(
      ledgerInput({
        invoices: [invoice("a", "paid", 4_000_000, new Date(2026, 8, 5)), invoice("b", "paid", 480_000, new Date(2026, 9, 12))],
        records: [payout("p1", 3_000_000, new Date(2026, 9, 1)), payout("p2", 360_000, new Date(2026, 9, 15))]
      })
    );
    const [september] = teacher.classes[0].periods;
    assert.equal(september.difference, 0);
    assert.equal(september.status.key, "done");
    const message = buildTeacherSalaryMessage(teacher, new Date(2026, 9, 20));
    assert.match(message, /Đã chuyển: 3\.000\.000\s₫ \(01\/10\) \+ 360\.000\s₫ \(15\/10\)/);
    assert.match(message, /Nộp muộn: HS b \(12\/10\)/);
  });
});

describe("salaryStatus", () => {
  const base = { mode: "percent" as const, paidOut: 0, difference: 0, waitingCount: 0, waitingShare: 0 };

  test("paying ahead of students who have not paid yet is an advance, not an overpayment", () => {
    assert.equal(salaryStatus({ ...base, paidOut: 1_000_000, difference: -200_000, waitingCount: 1, waitingShare: 360_000 }).key, "advance");
    assert.equal(salaryStatus({ ...base, paidOut: 1_000_000, difference: -200_000 }).key, "over");
  });

  test("fully paid on collected tuition but students still owe", () => {
    assert.equal(salaryStatus({ ...base, paidOut: 1_000_000, waitingCount: 2, waitingShare: 720_000 }).key, "waiting");
    assert.equal(salaryStatus({ ...base, paidOut: 1_000_000 }).key, "done");
    assert.equal(salaryStatus({ ...base, difference: 500_000 }).key, "unpaid");
  });
});
