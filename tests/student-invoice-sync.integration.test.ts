import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import { prisma } from "../src/lib/prisma";
import { syncUnpaidInvoicesWithStudent } from "../src/lib/student-invoice-sync";
import { assertSafeLedgerIntegrationDatabase, LedgerTestHarness } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();
const actor = { userId: null, username: "ledger-it" };

async function renamePhone(studentId: string, phone: string) {
  const student = await prisma.student.update({ where: { id: studentId }, data: { phone } });
  return prisma.$transaction((tx) =>
    syncUnpaidInvoicesWithStudent(tx, { id: student.id, fullName: student.fullName, phone: student.phone }, actor)
  );
}

describe("đồng bộ hóa đơn chưa đóng khi sửa hồ sơ học sinh", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("hai hóa đơn trùng memo cũ: đổi SĐT một bạn thì memo + snapshot đổi theo, bạn kia giữ nguyên", async () => {
    const fixture = await harness.createFixture();
    const first = await harness.createInvoice(fixture, { realMemo: { phoneSnapshot: fixture.phone } });
    const second = await harness.createSiblingInvoice(fixture, { suffix: "", month: first.month, year: first.year });
    assert.equal(first.memoContent, second.memoContent);

    const secondEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: second.enrollmentId } });
    const secondStudent = await prisma.student.findUniqueOrThrow({ where: { id: secondEnrollment.studentId } });
    const changes = await renamePhone(secondEnrollment.studentId, "0933444555");

    const updated = await prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: second.id } });
    assert.equal(changes.length, 1);
    assert.ok(updated.memoContent.includes("0933444555"));
    assert.ok(!updated.memoContent.includes(fixture.phone));
    assert.equal(updated.studentPhoneSnapshot, "0933444555");
    assert.equal(updated.studentNameSnapshot, secondStudent.fullName);

    const untouched = await prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: first.id } });
    assert.equal(untouched.memoContent, first.memoContent);

    const audit = await prisma.auditLog.count({
      where: { entityId: second.id, action: "invoice.memo_changed" }
    });
    assert.equal(audit, 1);
    await prisma.auditLog.deleteMany({ where: { entityId: second.id, action: "invoice.memo_changed" } });
  });

  test("đổi sang SĐT đang được bạn khác trong lớp dùng thì thêm hậu tố B", async () => {
    const fixture = await harness.createFixture();
    const first = await harness.createInvoice(fixture, { realMemo: { phoneSnapshot: fixture.phone } });
    const sibling = await harness.createSiblingInvoice(fixture, { suffix: "", month: first.month, year: first.year });
    const siblingEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: sibling.enrollmentId } });

    // Cố tình đổi sang cùng SĐT của bạn thứ nhất (SĐT hồ sơ của bạn này đang là SĐT cũ trùng sẵn).
    await prisma.student.update({ where: { id: siblingEnrollment.studentId }, data: { phone: "0900000001" } });
    await prisma.monthlyInvoice.update({ where: { id: sibling.id }, data: { memoContent: sibling.memoContent.replace(fixture.phone, "0900000001") } });
    await renamePhone(siblingEnrollment.studentId, fixture.phone);

    const updated = await prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: sibling.id } });
    assert.ok(updated.memoContent.includes(`${fixture.phone}B`), updated.memoContent);
    await prisma.auditLog.deleteMany({ where: { entityId: sibling.id, action: "invoice.memo_changed" } });
  });

  test("hóa đơn đã đóng giữ nguyên SĐT/memo lịch sử", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, { realMemo: { phoneSnapshot: fixture.phone } });
    await prisma.monthlyInvoice.update({ where: { id: invoice.id }, data: { status: "waived", statusReason: "test", statusChangedAt: new Date() } });

    const changes = await renamePhone(fixture.studentId, "0966777888");
    const after = await prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.equal(changes.length, 0);
    assert.equal(after.memoContent, invoice.memoContent);
    assert.equal(after.studentPhoneSnapshot, fixture.phone);
  });
});
