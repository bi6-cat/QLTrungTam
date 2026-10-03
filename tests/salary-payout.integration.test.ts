import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import { assignTransactionToInvoice } from "../src/lib/ledger";
import { prisma } from "../src/lib/prisma";
import { loadSalaryLedger } from "../src/lib/salary";
import { recordSalaryPayout } from "../src/lib/salary-payout";
import { periodIndex } from "../src/lib/enrollment-period";
import {
  assertSafeLedgerIntegrationDatabase,
  LedgerTestHarness
} from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();
// Hóa đơn của harness nằm ở các năm 2090+, nên "bây giờ" của test đặt sau đó. Ngày chuyển lương
// thì đặt trước thời điểm chạy test để khoản gán thanh toán (ghi theo giờ thật) tính là nộp muộn.
const now = new Date(2095, 0, 15);
const transferDay = (day: number) => new Date(2020, 0, day);

async function paidInvoice(fixture: Awaited<ReturnType<LedgerTestHarness["createFixture"]>>, amount: number) {
  const invoice = await harness.createInvoice(fixture, { amount });
  const transaction = await harness.createBankTransaction({ amount });
  await assignTransactionToInvoice({ transactionId: transaction.id, invoiceId: invoice.id, actor: harness.actor });
  return invoice;
}

describe("salary payouts", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("a payment after the cutoff moves to next month's salary, unless the class cuts off later", async () => {
    const fixture = await harness.createFixture();
    await prisma.classRoom.update({ where: { id: fixture.classId }, data: { teacherSharePercent: 75 } });
    const first = await paidInvoice(fixture, 4_000_000);
    const { month, year } = first;
    const index = periodIndex(month, year);
    // Học sinh đầu nộp đúng hạn trong tháng; học sinh thứ hai nộp ngày 3 tháng sau (sau ngày chốt cuối tháng).
    await prisma.monthlyInvoice.update({ where: { id: first.id }, data: { paidAt: new Date(year, month - 1, 10) } });
    const lateStudent = await prisma.student.create({
      data: { id: `${fixture.studentId}_late`, fullName: "HS nộp muộn", phone: "0911111111", address: "" }
    });
    const lateEnrollment = await prisma.enrollment.create({
      data: { id: `${fixture.enrollmentId}_late`, classId: fixture.classId, studentId: lateStudent.id }
    });
    const late = await prisma.monthlyInvoice.create({
      data: {
        enrollmentId: lateEnrollment.id,
        month,
        year,
        sessions: 1,
        pricePerSession: 480_000,
        amount: 480_000,
        memoContent: `LATE ${fixture.classId}`
      }
    });
    const lateTx = await harness.createBankTransaction({ amount: 480_000 });
    await assignTransactionToInvoice({ transactionId: lateTx.id, invoiceId: late.id, actor: harness.actor });
    await prisma.monthlyInvoice.update({ where: { id: late.id }, data: { paidAt: new Date(year, month, 3) } });

    await recordSalaryPayout({
      actor: harness.actor,
      paidAt: transferDay(1),
      note: "Lương tháng",
      lines: [{ classId: fixture.classId, month, year, amount: 3_000_000 }],
      now
    });

    const classPeriods = async () => {
      const ledger = await loadSalaryLedger({ fromIndex: index, toIndex: index + 1, now });
      return ledger.flatMap((teacher) => teacher.classes).find((item) => item.classId === fixture.classId)!.periods;
    };
    let [thisMonth, nextMonth] = await classPeriods();
    assert.equal(thisMonth.due, 3_000_000);
    assert.equal(thisMonth.difference, 0);
    assert.deepEqual(thisMonth.carriedOut.map((item) => item.studentName), ["HS nộp muộn"]);
    assert.equal(nextMonth.due, 360_000);
    assert.deepEqual(nextMonth.carriedIn.map((item) => [item.studentName, item.month]), [["HS nộp muộn", month]]);

    // Trả phần nộp muộn vào lương tháng sau.
    const next = { month: (index + 1) % 12 + 1, year: Math.floor((index + 1) / 12) };
    await recordSalaryPayout({
      actor: harness.actor,
      paidAt: transferDay(10),
      note: null,
      lines: [{ classId: fixture.classId, ...next, amount: 360_000 }],
      now
    });
    [thisMonth, nextMonth] = await classPeriods();
    assert.equal(nextMonth.difference, 0);
    assert.equal(nextMonth.status.key, "done");
    assert.equal(
      await prisma.auditLog.count({ where: { action: "salary.paid", actorUserId: harness.actor.userId } }),
      2
    );

    // Lớp chốt ngày 5 tháng sau: khoản nộp ngày 3 vẫn thuộc tháng cũ.
    await prisma.classRoom.update({ where: { id: fixture.classId }, data: { salaryCutoff: "next:5" } });
    [thisMonth, nextMonth] = await classPeriods();
    assert.equal(thisMonth.due, 3_360_000);
    assert.equal(thisMonth.difference, 360_000);
    assert.equal(thisMonth.carriedOut.length, 0);
    assert.equal(nextMonth.difference, -360_000);
  });

  test("rejects future months, duplicates and future transfer dates without writing anything", async () => {
    const fixture = await harness.createFixture();
    await prisma.classRoom.update({ where: { id: fixture.classId }, data: { teacherSharePercent: 50 } });
    const invoice = await paidInvoice(fixture, 1_000_000);
    const line = { classId: fixture.classId, month: invoice.month, year: invoice.year, amount: 100_000 };

    await assert.rejects(
      recordSalaryPayout({ actor: harness.actor, paidAt: transferDay(1), note: null, lines: [line], now: new Date(2089, 0, 1) }),
      /Chưa tới kỳ/
    );
    await assert.rejects(
      recordSalaryPayout({ actor: harness.actor, paidAt: transferDay(1), note: null, lines: [line, line], now }),
      /một dòng/
    );
    await assert.rejects(
      recordSalaryPayout({ actor: harness.actor, paidAt: new Date(2095, 5, 1), note: null, lines: [line], now }),
      /tương lai/
    );
    assert.equal(await prisma.expense.count({ where: { classId: fixture.classId } }), 0);
  });
});
