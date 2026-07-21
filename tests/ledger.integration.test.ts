import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import {
  assignTransactionToInvoice,
  LedgerError,
  type LedgerErrorCode,
  recordCashPayment,
  resolveUnmatchedTransaction,
  reverseTransaction,
  unassignTransaction
} from "../src/lib/ledger";
import { prisma } from "../src/lib/prisma";
import {
  assertSafeLedgerIntegrationDatabase,
  LedgerTestHarness
} from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();

async function expectLedgerError(
  operation: () => Promise<unknown>,
  expectedCode: LedgerErrorCode
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof LedgerError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function jsonObject(value: unknown) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

describe("financial ledger integration", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("assigns an exact bank transfer and writes both links plus audit", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, { amount: 800_000 });
    const transferredAt = new Date("2026-07-21T02:03:04.000Z");
    const transaction = await harness.createBankTransaction({
      amount: 800_000,
      transferredAt
    });

    const result = await assignTransactionToInvoice({
      transactionId: transaction.id,
      invoiceId: invoice.id,
      actor: harness.actor
    });

    assert.equal(result.transactionId, transaction.id);
    assert.equal(result.invoiceId, invoice.id);
    assert.equal(result.forced, false);
    assert.equal(result.amountDifference, 0);

    const [storedTransaction, storedInvoice, audit] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: {
          action: "transaction.assigned",
          entityType: "Transaction",
          entityId: transaction.id
        }
      })
    ]);

    assert.equal(storedTransaction.paymentMethod, "bank_transfer");
    assert.equal(storedTransaction.matchedInvoiceId, invoice.id);
    assert.ok(storedTransaction.matchedAt instanceof Date);
    assert.equal(storedTransaction.matchReason, "manual_assignment");
    assert.equal(storedTransaction.matchOverrideReason, null);
    assert.equal(storedInvoice.status, "paid");
    assert.equal(storedInvoice.transactionId, transaction.id);
    assert.equal(storedInvoice.paidAt?.toISOString(), transferredAt.toISOString());
    assert.equal(audit.actorUserId, harness.actor.userId);
    assert.equal(audit.actorUsername, harness.actor.username);
    assert.equal(audit.reason, null);

    const metadata = jsonObject(audit.metadata);
    assert.equal(metadata.invoiceId, invoice.id);
    assert.equal(metadata.amountDifference, 0);
    assert.equal(metadata.forced, false);
    assert.equal(metadata.paymentMethod, "bank_transfer");
  });

  test("blocks a mismatch and requires a reason before a forced match", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, { amount: 800_000 });
    const transaction = await harness.createBankTransaction({ amount: 750_000 });

    await expectLedgerError(
      () =>
        assignTransactionToInvoice({
          transactionId: transaction.id,
          invoiceId: invoice.id,
          actor: harness.actor
        }),
      "AMOUNT_MISMATCH"
    );
    await expectLedgerError(
      () =>
        assignTransactionToInvoice({
          transactionId: transaction.id,
          invoiceId: invoice.id,
          actor: harness.actor,
          force: true,
          reason: "   "
        }),
      "FORCE_REASON_REQUIRED"
    );

    const unchangedTransaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id }
    });
    const unchangedInvoice = await prisma.monthlyInvoice.findUniqueOrThrow({
      where: { id: invoice.id }
    });
    assert.equal(unchangedTransaction.matchedInvoiceId, null);
    assert.equal(unchangedInvoice.status, "unpaid");
    assert.equal(unchangedInvoice.transactionId, null);
    assert.equal(
      await prisma.auditLog.count({ where: { actorUserId: harness.actor.userId } }),
      0
    );

    const reason = "Phụ huynh chuyển thiếu 50.000 đồng";
    const result = await assignTransactionToInvoice({
      transactionId: transaction.id,
      invoiceId: invoice.id,
      actor: harness.actor,
      force: true,
      reason: `  ${reason}  `
    });

    assert.equal(result.forced, true);
    assert.equal(result.amountDifference, -50_000);

    const [storedTransaction, audit] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "transaction.assigned", entityId: transaction.id }
      })
    ]);
    assert.equal(storedTransaction.matchOverrideReason, reason);
    assert.equal(audit.reason, reason);
    const metadata = jsonObject(audit.metadata);
    assert.equal(metadata.transactionAmount, 750_000);
    assert.equal(metadata.invoiceAmount, 800_000);
    assert.equal(metadata.amountDifference, -50_000);
    assert.equal(metadata.forced, true);
  });

  test("prevents reusing either a matched transaction or a paid invoice", async () => {
    const fixture = await harness.createFixture();
    const firstInvoice = await harness.createInvoice(fixture);
    const secondInvoice = await harness.createInvoice(fixture);
    const firstTransaction = await harness.createBankTransaction();
    const secondTransaction = await harness.createBankTransaction();

    await assignTransactionToInvoice({
      transactionId: firstTransaction.id,
      invoiceId: firstInvoice.id,
      actor: harness.actor
    });

    await expectLedgerError(
      () =>
        assignTransactionToInvoice({
          transactionId: firstTransaction.id,
          invoiceId: secondInvoice.id,
          actor: harness.actor
        }),
      "TRANSACTION_ALREADY_MATCHED"
    );
    await expectLedgerError(
      () =>
        assignTransactionToInvoice({
          transactionId: secondTransaction.id,
          invoiceId: firstInvoice.id,
          actor: harness.actor
        }),
      "INVOICE_ALREADY_PAID"
    );

    const [storedSecondInvoice, storedSecondTransaction, assignmentAudits] =
      await Promise.all([
        prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: secondInvoice.id } }),
        prisma.transaction.findUniqueOrThrow({ where: { id: secondTransaction.id } }),
        prisma.auditLog.count({
          where: { actorUserId: harness.actor.userId, action: "transaction.assigned" }
        })
      ]);
    assert.equal(storedSecondInvoice.status, "unpaid");
    assert.equal(storedSecondInvoice.transactionId, null);
    assert.equal(storedSecondTransaction.matchedInvoiceId, null);
    assert.equal(assignmentAudits, 1);
  });

  test("unassigns atomically and preserves a reasoned audit trail", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();

    await assignTransactionToInvoice({
      transactionId: transaction.id,
      invoiceId: invoice.id,
      actor: harness.actor
    });
    const reason = "Admin chọn nhầm hóa đơn";
    const result = await unassignTransaction({
      transactionId: transaction.id,
      actor: harness.actor,
      reason
    });

    assert.equal(result.invoiceId, invoice.id);
    const [storedTransaction, storedInvoice, audit] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "transaction.unassigned", entityId: transaction.id }
      })
    ]);
    assert.equal(storedTransaction.matchedInvoiceId, null);
    assert.equal(storedTransaction.matchedAt, null);
    assert.equal(storedTransaction.matchReason, null);
    assert.equal(storedTransaction.matchOverrideReason, null);
    assert.equal(storedInvoice.status, "unpaid");
    assert.equal(storedInvoice.paidAt, null);
    assert.equal(storedInvoice.transactionId, null);
    assert.equal(audit.reason, reason);
    assert.equal(jsonObject(audit.metadata).invoiceId, invoice.id);

    await expectLedgerError(
      () =>
        unassignTransaction({
          transactionId: transaction.id,
          actor: harness.actor,
          reason: "Lặp lại"
        }),
      "TRANSACTION_NOT_MATCHED"
    );
  });

  test("reverses without deleting the transaction and reopens its invoice", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();

    await assignTransactionToInvoice({
      transactionId: transaction.id,
      invoiceId: invoice.id,
      actor: harness.actor
    });
    const reason = "Ngân hàng hoàn tiền";
    const result = await reverseTransaction({
      transactionId: transaction.id,
      actor: harness.actor,
      reason
    });

    assert.equal(result.invoiceId, invoice.id);
    const [storedTransaction, storedInvoice, audit, transactionCount] =
      await Promise.all([
        prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
        prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
        prisma.auditLog.findFirstOrThrow({
          where: { action: "transaction.reversed", entityId: transaction.id }
        }),
        prisma.transaction.count({ where: { id: transaction.id } })
      ]);
    assert.equal(transactionCount, 1);
    assert.ok(storedTransaction.reversedAt instanceof Date);
    assert.equal(storedTransaction.reversalReason, reason);
    assert.ok(storedTransaction.resolvedAt instanceof Date);
    assert.equal(storedTransaction.resolvedAt?.getTime(), storedTransaction.reversedAt?.getTime());
    assert.equal(storedTransaction.resolvedNote, `Hoàn tác: ${reason}`);
    assert.equal(storedTransaction.matchedInvoiceId, null);
    assert.equal(storedTransaction.matchedAt, null);
    assert.equal(storedInvoice.status, "unpaid");
    assert.equal(storedInvoice.transactionId, null);
    assert.equal(audit.reason, reason);
    assert.equal(jsonObject(audit.metadata).invoiceId, invoice.id);

    await expectLedgerError(
      () =>
        reverseTransaction({
          transactionId: transaction.id,
          actor: harness.actor,
          reason: "Lặp lại"
        }),
      "TRANSACTION_REVERSED"
    );
    assert.equal(await prisma.transaction.count({ where: { id: transaction.id } }), 1);
  });

  test("resolves an unmatched transaction with a note and audit", async () => {
    const transaction = await harness.createBankTransaction({ amount: 123_000 });
    const reason = "Nội dung không xác định, đã đối soát thủ công";

    const result = await resolveUnmatchedTransaction({
      transactionId: transaction.id,
      actor: harness.actor,
      reason: ` ${reason} `
    });

    assert.equal(result.invoiceId, null);
    const [storedTransaction, audit] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "transaction.resolved", entityId: transaction.id }
      })
    ]);
    assert.ok(storedTransaction.resolvedAt instanceof Date);
    assert.equal(storedTransaction.resolvedNote, reason);
    assert.equal(storedTransaction.matchedInvoiceId, null);
    assert.equal(audit.reason, reason);
    assert.equal(jsonObject(audit.metadata).amount, 123_000);

    await expectLedgerError(
      () =>
        resolveUnmatchedTransaction({
          transactionId: transaction.id,
          actor: harness.actor,
          reason: "Lặp lại"
        }),
      "TRANSACTION_ALREADY_RESOLVED"
    );
  });

  test("records cash with its payment method, dual links and audit", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture, { amount: 640_000 });
    const reason = "Phụ huynh nộp tại quầy";

    const result = await recordCashPayment({
      invoiceId: invoice.id,
      actor: harness.actor,
      reason: ` ${reason} `
    });

    const [transaction, storedInvoice, audit] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: result.transactionId } }),
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "transaction.cash_recorded", entityId: result.transactionId }
      })
    ]);
    assert.equal(transaction.amount, 640_000);
    assert.equal(transaction.paymentMethod, "cash");
    assert.match(transaction.gatewayRef, new RegExp(`^CASH-${invoice.id}-`));
    assert.equal(transaction.matchedInvoiceId, invoice.id);
    assert.equal(transaction.matchReason, "manual_cash_payment");
    assert.equal(storedInvoice.status, "paid");
    assert.equal(storedInvoice.transactionId, transaction.id);
    assert.equal(audit.reason, reason);
    const metadata = jsonObject(audit.metadata);
    assert.equal(metadata.invoiceId, invoice.id);
    assert.equal(metadata.paymentMethod, "cash");
    assert.equal(metadata.amount, 640_000);

    await expectLedgerError(
      () => recordCashPayment({ invoiceId: invoice.id, actor: harness.actor }),
      "INVOICE_ALREADY_PAID"
    );
  });

  test("keeps legacy cash classification and reversed-state guards at the database boundary", async () => {
    const legacyCash = await harness.createLegacyCashTransaction();
    assert.equal(legacyCash.paymentMethod, "cash");

    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const reversed = await harness.createBankTransaction();
    const reversedAt = new Date();
    await prisma.transaction.update({
      where: { id: reversed.id },
      data: {
        reversedAt,
        reversalReason: "Database guard test",
        resolvedAt: reversedAt,
        resolvedNote: "Hoàn tác: Database guard test"
      }
    });

    await assert.rejects(
      prisma.transaction.update({
        where: { id: reversed.id },
        data: { matchedInvoiceId: invoice.id }
      })
    );

    const stored = await prisma.transaction.findUniqueOrThrow({ where: { id: reversed.id } });
    assert.equal(stored.matchedInvoiceId, null);
    assert.ok(stored.reversedAt instanceof Date);
  });

  test("allows exactly one winner when two requests race for one transaction", async () => {
    const fixture = await harness.createFixture();
    const firstInvoice = await harness.createInvoice(fixture);
    const secondInvoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();

    const attempts = await Promise.allSettled([
      assignTransactionToInvoice({
        transactionId: transaction.id,
        invoiceId: firstInvoice.id,
        actor: harness.actor
      }),
      assignTransactionToInvoice({
        transactionId: transaction.id,
        invoiceId: secondInvoice.id,
        actor: harness.actor
      })
    ]);

    const fulfilled = attempts.filter(
      (attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof assignTransactionToInvoice>>> =>
        attempt.status === "fulfilled"
    );
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(rejected[0].reason instanceof LedgerError);
    assert.ok(
      ["TRANSACTION_ALREADY_MATCHED", "CONCURRENT_MODIFICATION"].includes(
        rejected[0].reason.code
      )
    );

    const [storedTransaction, invoices, auditCount] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.monthlyInvoice.findMany({
        where: { id: { in: [firstInvoice.id, secondInvoice.id] } },
        orderBy: { id: "asc" }
      }),
      prisma.auditLog.count({
        where: { action: "transaction.assigned", entityId: transaction.id }
      })
    ]);
    const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
    const unpaidInvoices = invoices.filter((invoice) => invoice.status === "unpaid");
    assert.equal(paidInvoices.length, 1);
    assert.equal(unpaidInvoices.length, 1);
    assert.equal(storedTransaction.matchedInvoiceId, paidInvoices[0].id);
    assert.equal(paidInvoices[0].transactionId, transaction.id);
    assert.equal(unpaidInvoices[0].transactionId, null);
    assert.equal(auditCount, 1);
  });
});
