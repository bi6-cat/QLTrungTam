import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  filterDebtRowsByPeriod,
  parseDebtPeriod,
  parseDebtSort,
  sortDebtRows,
  summarizeDebtPeriods,
  type DebtInvoice,
  type DebtRow
} from "../src/lib/debts";

const debt = (id: string, month: number, amount: number, monthsOverdue: number): DebtInvoice => ({
  id,
  month,
  year: 2026,
  amount,
  memoContent: "",
  className: "Toán 12",
  classShortCode: "T12",
  payUrl: "",
  monthsOverdue
});

const row = (studentId: string, studentName: string, invoices: DebtInvoice[]): DebtRow => ({
  studentId,
  studentName,
  phone: "0900000000",
  parentName: null,
  studentArchived: false,
  invoices,
  classes: [{ name: "Toán 12", shortCode: "T12" }],
  totalAmount: invoices.reduce((sum, invoice) => sum + invoice.amount, 0),
  oldestOverdue: Math.max(...invoices.map((invoice) => invoice.monthsOverdue)),
  primaryPayUrl: ""
});

const rows = [
  row("s1", "Bình", [debt("i1", 8, 500_000, 2), debt("i2", 10, 500_000, 0)]),
  row("s2", "An", [debt("i3", 9, 900_000, 1)]),
  row("s3", "Chi", [debt("i4", 10, 300_000, 0)])
];

describe("debts by month", () => {
  test("summarizes each tuition month, newest first", () => {
    assert.deepEqual(
      summarizeDebtPeriods(rows).map((period) => [period.key, period.studentCount, period.amount]),
      [
        ["2026-10", 2, 800_000],
        ["2026-09", 1, 900_000],
        ["2026-08", 1, 500_000]
      ]
    );
  });

  test("filtering a month keeps only that month's invoices and recomputes totals", () => {
    const october = filterDebtRowsByPeriod(rows, { month: 10, year: 2026 });
    assert.deepEqual(october.map((item) => [item.studentId, item.totalAmount, item.oldestOverdue]), [
      ["s1", 500_000, 0],
      ["s3", 300_000, 0]
    ]);
  });

  test("sorts by oldest debt, newest month, amount or name", () => {
    assert.deepEqual(sortDebtRows(rows, "oldest").map((item) => item.studentId), ["s1", "s2", "s3"]);
    assert.deepEqual(sortDebtRows(rows, "newest").map((item) => item.studentId), ["s1", "s3", "s2"]);
    assert.deepEqual(sortDebtRows(rows, "amount").map((item) => item.studentId), ["s1", "s2", "s3"]);
    assert.deepEqual(sortDebtRows(rows, "name").map((item) => item.studentName), ["An", "Bình", "Chi"]);
  });

  test("parses query params defensively", () => {
    assert.deepEqual(parseDebtPeriod("2026-09"), { month: 9, year: 2026 });
    assert.equal(parseDebtPeriod("2026-13"), null);
    assert.equal(parseDebtPeriod(undefined), null);
    assert.equal(parseDebtSort("amount"), "amount");
    assert.equal(parseDebtSort("drop table"), "oldest");
  });
});
