import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";
import { Prisma } from "@prisma/client";

import {
  changeInvoiceLifecycle,
  InvoiceLifecycleError,
  type InvoiceLifecycleErrorCode
} from "../src/lib/invoice-lifecycle";
import { assignTransactionToInvoice, LedgerError } from "../src/lib/ledger";
import { prisma } from "../src/lib/prisma";
import {
  assertSafeLedgerIntegrationDatabase,
  LedgerTestHarness
} from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();

async function expectLifecycleError(
  operation: () => Promise<unknown>,
  expectedCode: InvoiceLifecycleErrorCode
) {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error instanceof InvoiceLifecycleError);
    assert.equal(error.code, expectedCode);
    return true;
  });
}

function jsonObject(value: unknown) {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

describe("invoice lifecycle and monthly enrollment integration", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("voids and restores an unpaid invoice with reasoned audits", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const voidReason = "Phát hành nhầm tháng";

    const voided = await changeInvoiceLifecycle({
      invoiceId: invoice.id,
      targetStatus: "void",
      actor: harness.actor,
      reason: `  ${voidReason}  `
    });

    assert.equal(voided.previousStatus, "unpaid");
    assert.equal(voided.targetStatus, "void");

    const [storedVoid, voidAudit] = await Promise.all([
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "invoice.voided", entityId: invoice.id }
      })
    ]);
    assert.equal(storedVoid.status, "void");
    assert.equal(storedVoid.statusReason, voidReason);
    assert.ok(storedVoid.statusChangedAt instanceof Date);
    assert.equal(voidAudit.entityType, "MonthlyInvoice");
    assert.equal(voidAudit.actorUserId, harness.actor.userId);
    assert.equal(voidAudit.reason, voidReason);
    assert.deepEqual(
      {
        previousStatus: jsonObject(voidAudit.metadata).previousStatus,
        targetStatus: jsonObject(voidAudit.metadata).targetStatus,
        amount: jsonObject(voidAudit.metadata).amount,
        month: jsonObject(voidAudit.metadata).month,
        year: jsonObject(voidAudit.metadata).year
      },
      {
        previousStatus: "unpaid",
        targetStatus: "void",
        amount: invoice.amount,
        month: invoice.month,
        year: invoice.year
      }
    );

    const restoreReason = "Đã xác nhận cần thu lại";
    const restored = await changeInvoiceLifecycle({
      invoiceId: invoice.id,
      targetStatus: "unpaid",
      actor: harness.actor,
      reason: restoreReason
    });

    assert.equal(restored.previousStatus, "void");
    assert.equal(restored.targetStatus, "unpaid");
    const [storedRestore, restoreAudit] = await Promise.all([
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.auditLog.findFirstOrThrow({
        where: { action: "invoice.restored", entityId: invoice.id }
      })
    ]);
    assert.equal(storedRestore.status, "unpaid");
    assert.equal(storedRestore.statusReason, restoreReason);
    assert.ok(storedRestore.statusChangedAt instanceof Date);
    assert.equal(restoreAudit.reason, restoreReason);
    assert.equal(jsonObject(restoreAudit.metadata).previousStatus, "void");
    assert.equal(jsonObject(restoreAudit.metadata).targetStatus, "unpaid");
  });

  test("waives an unpaid invoice and rejects unsupported or reasonless transitions", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);

    await expectLifecycleError(
      () =>
        changeInvoiceLifecycle({
          invoiceId: invoice.id,
          targetStatus: "waived",
          actor: harness.actor,
          reason: "   "
        }),
      "REASON_REQUIRED"
    );

    await changeInvoiceLifecycle({
      invoiceId: invoice.id,
      targetStatus: "waived",
      actor: harness.actor,
      reason: "Miễn học phí theo chính sách trung tâm"
    });

    await expectLifecycleError(
      () =>
        changeInvoiceLifecycle({
          invoiceId: invoice.id,
          targetStatus: "waived",
          actor: harness.actor,
          reason: "Lặp lại"
        }),
      "NO_OP"
    );
    await expectLifecycleError(
      () =>
        changeInvoiceLifecycle({
          invoiceId: invoice.id,
          targetStatus: "void",
          actor: harness.actor,
          reason: "Không được đổi trực tiếp"
        }),
      "INVALID_TRANSITION"
    );

    const stored = await prisma.monthlyInvoice.findUniqueOrThrow({
      where: { id: invoice.id }
    });
    assert.equal(stored.status, "waived");
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: invoice.id, action: { startsWith: "invoice." } }
      }),
      1
    );
  });

  test("enforces lifecycle reason and timestamp metadata at the database boundary", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);

    await assert.rejects(
      prisma.monthlyInvoice.update({
        where: { id: invoice.id },
        data: { status: "void" }
      })
    );
    await assert.rejects(
      prisma.monthlyInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "void",
          statusReason: " \t\n ",
          statusChangedAt: new Date()
        }
      })
    );
    await assert.rejects(
      prisma.monthlyInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "waived",
          statusReason: "Có lý do nhưng thiếu thời điểm"
        }
      })
    );

    const changedAt = new Date("2026-07-21T08:00:00.000Z");
    await prisma.monthlyInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "void",
        statusReason: "Phát hành nhầm",
        statusChangedAt: changedAt
      }
    });
    const restored = await prisma.monthlyInvoice.update({
      where: { id: invoice.id },
      data: { status: "unpaid" }
    });

    assert.equal(restored.status, "unpaid");
    assert.equal(restored.statusReason, "Phát hành nhầm");
    assert.equal(restored.statusChangedAt?.toISOString(), changedAt.toISOString());
  });

  test("blocks void, waive and restore when a reverse transaction link remains", async () => {
    const fixture = await harness.createFixture();
    const cases = [
      { targetStatus: "void" as const, sourceStatus: "unpaid" as const },
      { targetStatus: "waived" as const, sourceStatus: "unpaid" as const },
      { targetStatus: "unpaid" as const, sourceStatus: "void" as const }
    ];

    for (const [index, transition] of cases.entries()) {
      const invoice = await harness.createInvoice(fixture);
      if (transition.sourceStatus === "void") {
        await prisma.monthlyInvoice.update({
          where: { id: invoice.id },
          data: {
            status: "void",
            statusReason: "Hóa đơn legacy đã hủy",
            statusChangedAt: new Date()
          }
        });
      }
      const transaction = await harness.createBankTransaction();
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          matchedInvoiceId: invoice.id,
          matchedAt: new Date(),
          matchReason: "legacy_reverse_link"
        }
      });

      await expectLifecycleError(
        () =>
          changeInvoiceLifecycle({
            invoiceId: invoice.id,
            targetStatus: transition.targetStatus,
            actor: harness.actor,
            reason: `Đối soát liên kết ngược ${index + 1}`
          }),
        "INVOICE_HAS_PAYMENT_DATA"
      );

      const stored = await prisma.monthlyInvoice.findUniqueOrThrow({
        where: { id: invoice.id }
      });
      assert.equal(stored.status, transition.sourceStatus);
      assert.equal(stored.transactionId, null);
    }

    assert.equal(
      await prisma.auditLog.count({
        where: { actorUserId: harness.actor.userId, action: { startsWith: "invoice." } }
      }),
      0
    );
  });

  test("does not void or waive an invoice that has been paid", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();
    await assignTransactionToInvoice({
      invoiceId: invoice.id,
      transactionId: transaction.id,
      actor: harness.actor
    });

    await expectLifecycleError(
      () =>
        changeInvoiceLifecycle({
          invoiceId: invoice.id,
          targetStatus: "void",
          actor: harness.actor,
          reason: "Không được hủy khoản đã thu"
        }),
      "INVOICE_PAID"
    );
    await expectLifecycleError(
      () =>
        changeInvoiceLifecycle({
          invoiceId: invoice.id,
          targetStatus: "waived",
          actor: harness.actor,
          reason: "Không được miễn khoản đã thu"
        }),
      "INVOICE_PAID"
    );

    const stored = await prisma.monthlyInvoice.findUniqueOrThrow({
      where: { id: invoice.id }
    });
    assert.equal(stored.status, "paid");
    assert.equal(stored.transactionId, transaction.id);
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: invoice.id, action: { startsWith: "invoice." } }
      }),
      0
    );
  });

  test("allows only payment or void to win when both race for one invoice", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();

    const attempts = await Promise.allSettled([
      assignTransactionToInvoice({
        invoiceId: invoice.id,
        transactionId: transaction.id,
        actor: harness.actor
      }),
      changeInvoiceLifecycle({
        invoiceId: invoice.id,
        targetStatus: "void",
        actor: harness.actor,
        reason: "Hủy đồng thời khi đối soát"
      })
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === "fulfilled");
    const rejected = attempts.filter(
      (attempt): attempt is PromiseRejectedResult => attempt.status === "rejected"
    );
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.ok(
      rejected[0].reason instanceof LedgerError ||
        rejected[0].reason instanceof InvoiceLifecycleError
    );

    const [storedInvoice, storedTransaction, auditCount] = await Promise.all([
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.auditLog.count({
        where: {
          OR: [
            { action: "transaction.assigned", entityId: transaction.id },
            { action: "invoice.voided", entityId: invoice.id }
          ]
        }
      })
    ]);
    assert.equal(auditCount, 1);

    if (storedInvoice.status === "paid") {
      assert.equal(storedInvoice.transactionId, transaction.id);
      assert.equal(storedTransaction.matchedInvoiceId, invoice.id);
    } else {
      assert.equal(storedInvoice.status, "void");
      assert.equal(storedInvoice.transactionId, null);
      assert.equal(storedTransaction.matchedInvoiceId, null);
    }
  });

  test("does not race a lifecycle change past a reverse-only transaction link", async () => {
    const fixture = await harness.createFixture();
    const invoice = await harness.createInvoice(fixture);
    const transaction = await harness.createBankTransaction();

    const attempts = await Promise.allSettled([
      changeInvoiceLifecycle({
        invoiceId: invoice.id,
        targetStatus: "void",
        actor: harness.actor,
        reason: "Hủy đồng thời với liên kết legacy"
      }),
      prisma.$transaction(
        (tx) =>
          tx.transaction.update({
            where: { id: transaction.id },
            data: {
              matchedInvoiceId: invoice.id,
              matchedAt: new Date(),
              matchReason: "legacy_reverse_link_race"
            }
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);

    const [storedInvoice, storedTransaction, lifecycleAuditCount] = await Promise.all([
      prisma.monthlyInvoice.findUniqueOrThrow({ where: { id: invoice.id } }),
      prisma.transaction.findUniqueOrThrow({ where: { id: transaction.id } }),
      prisma.auditLog.count({
        where: { action: "invoice.voided", entityId: invoice.id }
      })
    ]);

    if (storedInvoice.status === "void") {
      assert.equal(storedTransaction.matchedInvoiceId, null);
      assert.equal(lifecycleAuditCount, 1);
    } else {
      assert.equal(storedInvoice.status, "unpaid");
      assert.equal(storedTransaction.matchedInvoiceId, invoice.id);
      assert.equal(lifecycleAuditCount, 0);
    }
  });

  test("keeps status, sessions and price isolated between enrollment months", async () => {
    const fixture = await harness.createFixture();
    await prisma.enrollment.update({
      where: { id: fixture.enrollmentId },
      data: { status: "active", sessionsOverride: 7 }
    });
    await prisma.enrollmentMonth.createMany({
      data: [
        {
          enrollmentId: fixture.enrollmentId,
          month: 7,
          year: 2088,
          status: "active",
          sessions: 8,
          pricePerSession: 100_000
        },
        {
          enrollmentId: fixture.enrollmentId,
          month: 8,
          year: 2088,
          status: "on_leave",
          sessions: 0,
          pricePerSession: 110_000
        }
      ]
    });

    await prisma.enrollmentMonth.update({
      where: {
        enrollmentId_month_year: {
          enrollmentId: fixture.enrollmentId,
          month: 7,
          year: 2088
        }
      },
      data: { status: "on_leave", sessions: 0 }
    });

    const [enrollment, july, august] = await Promise.all([
      prisma.enrollment.findUniqueOrThrow({ where: { id: fixture.enrollmentId } }),
      prisma.enrollmentMonth.findUniqueOrThrow({
        where: {
          enrollmentId_month_year: {
            enrollmentId: fixture.enrollmentId,
            month: 7,
            year: 2088
          }
        }
      }),
      prisma.enrollmentMonth.findUniqueOrThrow({
        where: {
          enrollmentId_month_year: {
            enrollmentId: fixture.enrollmentId,
            month: 8,
            year: 2088
          }
        }
      })
    ]);

    assert.equal(enrollment.status, "active");
    assert.equal(enrollment.sessionsOverride, 7);
    assert.deepEqual(
      { status: july.status, sessions: july.sessions, price: july.pricePerSession },
      { status: "on_leave", sessions: 0, price: 100_000 }
    );
    assert.deepEqual(
      { status: august.status, sessions: august.sessions, price: august.pricePerSession },
      { status: "on_leave", sessions: 0, price: 110_000 }
    );
  });
});
