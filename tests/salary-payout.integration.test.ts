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

  test("partial transfer, late payment, then a top-up recorded against the same month", async () => {
    const fixture = await harness.createFixture();
    await prisma.classRoom.update({ where: { id: fixture.classId }, data: { teacherSharePercent: 75 } });
    const first = await paidInvoice(fixture, 4_000_000);
    // Học sinh đầu nộp đúng hạn, trước lần chuyển lương đầu tiên.
    await prisma.monthlyInvoice.update({ where: { id: first.id }, data: { paidAt: new Date(2019, 11, 20) } });
    const { month, year } = first;

    const [initial] = await recordSalaryPayout({
      actor: harness.actor,
      paidAt: transferDay(1),
      note: "Lần 1",
      lines: [{ classId: fixture.classId, month, year, amount: 2_500_000 }],
      now
    });
    assert.equal(initial.line.due, 3_000_000);

    // Một học sinh khác của cùng lớp, cùng kỳ, nộp sau khi đã chuyển lương. Id mang tiền tố của
    // fixture nên harness tự dọn.
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

    const index = periodIndex(month, year);
    let ledger = await loadSalaryLedger({ fromIndex: index, toIndex: index });
    let period = ledger.flatMap((teacher) => teacher.classes).find((item) => item.classId === fixture.classId)!.periods[0];
    assert.equal(period.due, 3_360_000);
    assert.equal(period.paidOut, 2_500_000);
    assert.equal(period.difference, 860_000);
    assert.deepEqual(period.latePayers.map((item) => item.studentName), ["HS nộp muộn"]);

    await recordSalaryPayout({
      actor: harness.actor,
      paidAt: transferDay(10),
      note: null,
      lines: [{ classId: fixture.classId, month, year, amount: 860_000 }],
      now
    });
    ledger = await loadSalaryLedger({ fromIndex: index, toIndex: index });
    period = ledger.flatMap((teacher) => teacher.classes).find((item) => item.classId === fixture.classId)!.periods[0];
    assert.equal(period.difference, 0);
    assert.equal(period.status.key, "done");
    assert.deepEqual(
      period.payouts.map((payout) => [payout.amount, payout.sharePercent, payout.note]),
      [
        [2_500_000, 75, "Lần 1"],
        [860_000, 75, null]
      ]
    );
    assert.match(period.payouts[1].description, /Chuyển thêm lương .* \(lần 2\)/);

    const audits = await prisma.auditLog.count({ where: { action: "salary.paid", actorUserId: harness.actor.userId } });
    assert.equal(audits, 2);
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
