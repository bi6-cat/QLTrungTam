import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import { matchInvoiceFromTransaction } from "../src/lib/payment";
import { prisma } from "../src/lib/prisma";
import {
  assertSafeLedgerIntegrationDatabase,
  LedgerTestHarness
} from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();
const transferredAt = new Date("2026-10-03T03:00:00.000Z");

describe("memo matching", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("still matches the issued memo after the student's phone changes", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, {
      amount: 800_000,
      realMemo: { phoneSnapshot: fixture.phone }
    });
    await prisma.student.update({
      where: { id: fixture.studentId },
      data: { phone: "0911222333" }
    });

    const match = await matchInvoiceFromTransaction({
      content: `MBVCB.123.${invoice.memoContent}.CT tu 0123`,
      amount: 800_000,
      transferredAt
    });
    assert.equal(match.invoice?.id, invoice.id);
    assert.equal(match.reason, null);
  });

  test("does not match a memo built from the new phone against an older invoice", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, {
      amount: 800_000,
      realMemo: { phoneSnapshot: fixture.phone }
    });
    await prisma.student.update({
      where: { id: fixture.studentId },
      data: { phone: "0911222444" }
    });

    const memoWithNewPhone = invoice.memoContent.replace(fixture.phone, "0911222444");
    const match = await matchInvoiceFromTransaction({
      content: memoWithNewPhone,
      amount: 800_000,
      transferredAt
    });
    assert.equal(match.invoice, null);
  });

  test("falls back to the current phone for invoices without a phone snapshot", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, {
      amount: 800_000,
      realMemo: { phoneSnapshot: null }
    });

    const match = await matchInvoiceFromTransaction({
      content: invoice.memoContent,
      amount: 800_000,
      transferredAt
    });
    assert.equal(match.invoice?.id, invoice.id);
  });
});
