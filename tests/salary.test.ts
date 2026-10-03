import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildSalaryLedger,
  buildTeacherSalaryMessage,
  computeSalary,
  computeSalaryLines,
  salaryLineNotes,
  salaryStatus,
  type SalaryInput
} from "../src/lib/salary";
import {
  cutoffResolver,
  DEFAULT_SALARY_CUTOFF,
  describeSalaryCutoff,
  parseSalaryCutoff,
  salaryCutoffDate,
  salaryIndexForPayment
} from "../src/lib/salary-cutoff";

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

const index = (month: number, year = 2026) => year * 12 + (month - 1);
const SEP = index(9);
const OCT = index(10);

describe("salary cutoff", () => {
  test("parses codes and clamps the end of month", () => {
    assert.deepEqual(parseSalaryCutoff("same:31"), { nextMonth: false, day: 31 });
    assert.deepEqual(parseSalaryCutoff("next:5"), { nextMonth: true, day: 5 });
    assert.equal(parseSalaryCutoff("next:0"), null);
    assert.equal(parseSalaryCutoff(""), null);
    assert.deepEqual(salaryCutoffDate(DEFAULT_SALARY_CUTOFF, SEP), new Date(2026, 8, 30));
    assert.deepEqual(salaryCutoffDate(DEFAULT_SALARY_CUTOFF, index(2)), new Date(2026, 1, 28));
    assert.deepEqual(salaryCutoffDate({ nextMonth: true, day: 5 }, SEP), new Date(2026, 9, 5));
    assert.equal(describeSalaryCutoff(DEFAULT_SALARY_CUTOFF), "cuối tháng");
    assert.equal(describeSalaryCutoff({ nextMonth: true, day: 5 }), "ngày 5 tháng sau");
  });

  test("payments up to the end of the cutoff day stay in the month, later ones move on", () => {
    const endOfMonth = DEFAULT_SALARY_CUTOFF;
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 8, 30, 23, 59), endOfMonth), SEP);
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 9, 1, 0, 0), endOfMonth), OCT);
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 10, 15), endOfMonth), index(11));
    // Đóng trước kỳ học (đóng sớm) vẫn tính đúng tháng của kỳ đó.
    assert.equal(salaryIndexForPayment(OCT, new Date(2026, 7, 20), endOfMonth), OCT);
    const fifthNextMonth = { nextMonth: true, day: 5 };
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 9, 5, 18), fifthNextMonth), SEP);
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 9, 6), fifthNextMonth), OCT);
  });
});

function salaryInput(overrides: Partial<SalaryInput> = {}): SalaryInput {
  return {
    fromIndex: SEP,
    toIndex: OCT,
    now: new Date(2026, 9, 20),
    defaultCutoff: DEFAULT_SALARY_CUTOFF,
    classes: [
      {
        id: "c1",
        name: "Văn 9",
        shortCode: "26V9A",
        teacherName: "Cô Hương",
        teacherSharePercent: 75,
        archivedAt: null,
        salaryCutoff: null
      }
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
): SalaryInput["invoices"][number] => ({
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

const payout = (id: string, amount: number, paidAt: Date, month = 9): SalaryInput["records"][number] => ({
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

describe("computeSalaryLines", () => {
  test("a payment after the cutoff moves to next month's salary and is noted on both months", () => {
    const [september, october] = computeSalaryLines(
      salaryInput({
        invoices: [
          invoice("a", "paid", 4_000_000, new Date(2026, 8, 5)),
          invoice("b", "paid", 480_000, new Date(2026, 9, 2)),
          invoice("c", "paid", 960_000, new Date(2026, 9, 3), 10)
        ],
        records: [payout("p1", 3_000_000, new Date(2026, 8, 30))]
      })
    );
    assert.equal(september.due, 3_000_000);
    assert.equal(september.difference, 0);
    assert.equal(september.status.key, "done");
    assert.deepEqual(
      september.carriedOut.map((item) => [item.studentName, item.salaryMonth]),
      [["HS b", 10]]
    );

    assert.equal(october.collected, 1_440_000);
    assert.equal(october.due, 1_080_000);
    assert.deepEqual(october.carriedIn.map((item) => [item.studentName, item.month, item.share]), [["HS b", 9, 360_000]]);
    assert.equal(october.carriedInShare, 360_000);
    const notes = salaryLineNotes(october).map((note) => note.tone);
    assert.deepEqual(notes, ["in"]);
  });

  test("a class can use its own cutoff instead of the centre default", () => {
    const [september] = computeSalaryLines(
      salaryInput({
        classes: [
          {
            id: "c1",
            name: "Văn 9",
            shortCode: "26V9A",
            teacherName: "Cô Hương",
            teacherSharePercent: 75,
            archivedAt: null,
            salaryCutoff: "next:5"
          }
        ],
        invoices: [invoice("a", "paid", 4_000_000, new Date(2026, 8, 5)), invoice("b", "paid", 480_000, new Date(2026, 9, 2))]
      })
    );
    assert.equal(september.customCutoff, true);
    assert.equal(september.due, 3_360_000);
    assert.equal(september.carriedOut.length, 0);
  });

  test("unpaid students only count as pending while the cutoff has not passed", () => {
    const [september, october] = computeSalaryLines(
      salaryInput({
        invoices: [
          invoice("a", "paid", 960_000, new Date(2026, 8, 5)),
          invoice("b", "unpaid", 480_000),
          invoice("c", "paid", 480_000, new Date(2026, 9, 5), 10),
          invoice("d", "unpaid", 480_000, null, 10)
        ],
        records: [payout("p1", 720_000, new Date(2026, 8, 30))]
      })
    );
    assert.equal(september.cutoffPassed, true);
    assert.equal(september.status.key, "done");
    assert.match(salaryLineNotes(september)[0].text, /nộp sau sẽ tính vào lương tháng sau/);
    assert.equal(october.cutoffPassed, false);
    assert.equal(october.waitingShare, 360_000);
    assert.equal(october.status.key, "unpaid");
  });

  test("months without tuition or transfers are skipped and classes without a share are ignored", () => {
    const lines = computeSalaryLines(
      salaryInput({
        classes: [
          {
            id: "c1",
            name: "Văn 9",
            shortCode: "26V9A",
            teacherName: "Cô Hương",
            teacherSharePercent: 75,
            archivedAt: null,
            salaryCutoff: null
          },
          { id: "c2", name: "Tự học", shortCode: "TH", teacherName: "", teacherSharePercent: 0, archivedAt: null, salaryCutoff: null }
        ],
        invoices: [invoice("a", "paid", 1_000_000, new Date(2026, 9, 3), 10)]
      })
    );
    assert.deepEqual(lines.map((line) => [line.classId, line.month]), [["c1", 10]]);
  });
});

describe("month-specific cutoffs", () => {
  test("an override moves the cutoff for that month only", () => {
    const resolver = cutoffResolver(DEFAULT_SALARY_CUTOFF, new Map([[index(8), new Date(2026, 7, 30)]]));
    assert.equal(resolver.overridden(index(8)), true);
    assert.equal(salaryIndexForPayment(index(8), new Date(2026, 7, 30, 22), resolver), index(8));
    assert.equal(salaryIndexForPayment(index(8), new Date(2026, 7, 31, 19, 41), resolver), SEP);
    assert.equal(salaryIndexForPayment(SEP, new Date(2026, 8, 30, 20), resolver), SEP);
  });

  test("classes following the centre default use it, classes with their own rule do not", () => {
    const classes = [
      { id: "c1", name: "Văn 9", shortCode: "26V9A", teacherName: "Cô Hương", teacherSharePercent: 75, archivedAt: null, salaryCutoff: null },
      { id: "c2", name: "Anh 9", shortCode: "26TA9A", teacherName: "Cô Lệ", teacherSharePercent: 75, archivedAt: null, salaryCutoff: "same:31" }
    ];
    const lines = computeSalaryLines(
      salaryInput({
        fromIndex: index(8),
        toIndex: SEP,
        classes,
        monthCutoffs: [{ month: 8, year: 2026, cutoffDate: new Date(2026, 7, 30) }],
        invoices: [
          { ...invoice("a", "paid", 360_000, new Date(2026, 7, 31, 19, 41), 8), classId: "c1" },
          { ...invoice("b", "paid", 360_000, new Date(2026, 7, 31, 19, 41), 8), classId: "c2" }
        ]
      })
    );
    const byClass = (classId: string, month: number) => lines.find((line) => line.classId === classId && line.month === month)!;
    assert.equal(byClass("c1", 8).cutoffOverridden, true);
    assert.equal(byClass("c1", 8).carriedOut.length, 1);
    assert.equal(byClass("c1", 9).due, 270_000);
    assert.equal(byClass("c2", 8).cutoffOverridden, false);
    assert.equal(byClass("c2", 8).due, 270_000);
  });
});

describe("buildSalaryLedger", () => {
  test("groups months per class and teacher, and the message lists transfers and late payers", () => {
    const [teacher] = buildSalaryLedger(
      computeSalaryLines(
        salaryInput({
          invoices: [invoice("a", "paid", 4_000_000, new Date(2026, 8, 5)), invoice("b", "paid", 480_000, new Date(2026, 9, 2))],
          records: [payout("p1", 2_500_000, new Date(2026, 8, 30)), payout("p2", 500_000, new Date(2026, 9, 10))]
        })
      )
    );
    assert.equal(teacher.teacherName, "Cô Hương");
    assert.deepEqual(teacher.classes[0].periods.map((period) => period.month), [9, 10]);
    assert.equal(teacher.owed, 360_000);
    assert.equal(teacher.openPeriods, 1);
    const message = buildTeacherSalaryMessage(teacher, new Date(2026, 9, 20));
    assert.match(message, /Đã chuyển: 2\.500\.000\s₫ \(30\/09\) \+ 500\.000\s₫ \(10\/10\)/);
    assert.match(message, /Nộp sau ngày chốt 30\/09, tính sang lương sau: HS b \(nộp 02\/10 → T10\)/);
    assert.match(message, /Nộp muộn tháng trước, tính vào đây: HS b \(T9 · nộp 02\/10\)/);
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
