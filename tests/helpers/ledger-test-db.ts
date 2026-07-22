import { randomUUID } from "node:crypto";

import { prisma } from "../../src/lib/prisma";

const NON_TEST_DATABASE_CONFIRMATION_ENV = "LEDGER_INTEGRATION_DATABASE_CONFIRMATION";

export function assertSafeLedgerIntegrationDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("Ledger integration tests require DATABASE_URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Ledger integration tests require a valid DATABASE_URL.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  if (!databaseName) {
    throw new Error("Ledger integration tests could not determine the database name.");
  }

  const expectedConfirmation = `I_UNDERSTAND_LEDGER_TESTS_MUTATE_${databaseName}`;
  const explicitlyConfirmed =
    process.env[NON_TEST_DATABASE_CONFIRMATION_ENV] === expectedConfirmation;

  if (!databaseName.toLowerCase().includes("_test") && !explicitlyConfirmed) {
    throw new Error(
      `Refusing to run ledger integration tests against database "${databaseName}". ` +
        `Use a database whose name contains "_test", or set ${NON_TEST_DATABASE_CONFIRMATION_ENV}=` +
        `${expectedConfirmation} after verifying the target.`
    );
  }

  return databaseName;
}

export type LedgerFixture = {
  classId: string;
  studentId: string;
  enrollmentId: string;
};

type CreateInvoiceOptions = {
  amount?: number;
};

type CreateBankTransactionOptions = {
  amount?: number;
  transferredAt?: Date;
};

/**
 * Creates namespaced fixtures and removes only records owned by this test run.
 * It deliberately avoids TRUNCATE/deleteMany without a scoped predicate.
 */
export class LedgerTestHarness {
  private readonly runKey = randomUUID().replaceAll("-", "");
  private readonly entityPrefix = `ledger_it_${this.runKey}_`;
  private readonly gatewayPrefix = `LEDGER-IT-${this.runKey}`;
  private fixtureSequence = 0;
  private invoiceSequence = 0;
  private transactionSequence = 0;

  readonly actor = {
    userId: `${this.entityPrefix}admin`,
    username: `ledger-it-${this.runKey}`
  };

  async start() {
    await prisma.adminUser.create({
      data: {
        id: this.actor.userId,
        username: this.actor.username,
        passwordHash: "unused-ledger-integration-test-password-hash"
      }
    });
  }

  async createFixture(): Promise<LedgerFixture> {
    this.fixtureSequence += 1;
    const suffix = this.fixtureSequence.toString();
    const classId = `${this.entityPrefix}class_${suffix}`;
    const studentId = `${this.entityPrefix}student_${suffix}`;
    const enrollmentId = `${this.entityPrefix}enrollment_${suffix}`;

    await prisma.classRoom.create({
      data: {
        id: classId,
        name: `Ledger integration class ${suffix}`,
        shortCode: `LIT-${this.runKey.slice(0, 12)}-${suffix}`,
        teacherName: "Ledger Test",
        pricePerSession: 100_000,
        sessionsPerMonthDefault: 8
      }
    });
    await prisma.student.create({
      data: {
        id: studentId,
        fullName: `Ledger integration student ${suffix}`,
        phone: `0900${suffix.padStart(6, "0")}`,
        address: "Ledger integration test address"
      }
    });
    await prisma.enrollment.create({
      data: { id: enrollmentId, classId, studentId }
    });

    return { classId, studentId, enrollmentId };
  }

  async createInvoice(fixture: LedgerFixture, options: CreateInvoiceOptions = {}) {
    this.invoiceSequence += 1;
    const amount = options.amount ?? 800_000;
    const sequence = this.invoiceSequence - 1;
    const month = (sequence % 12) + 1;
    const year = 2090 + Math.floor(sequence / 12);

    return prisma.monthlyInvoice.create({
      data: {
        id: `${this.entityPrefix}invoice_${this.invoiceSequence}`,
        enrollmentId: fixture.enrollmentId,
        month,
        year,
        sessions: 1,
        pricePerSession: amount,
        amount,
        memoContent: `LEDGER IT ${this.runKey} ${this.invoiceSequence}`
      }
    });
  }

  async createBankTransaction(options: CreateBankTransactionOptions = {}) {
    this.transactionSequence += 1;
    const sequence = this.transactionSequence;
    const transferredAt =
      options.transferredAt ?? new Date(Date.UTC(2026, 6, 21, 1, 0, sequence));

    return prisma.transaction.create({
      data: {
        id: `${this.entityPrefix}transaction_${sequence}`,
        gatewayRef: `${this.gatewayPrefix}-${sequence}-${randomUUID()}`,
        amount: options.amount ?? 800_000,
        rawContent: `LEDGER_INTEGRATION_TEST:${this.runKey}`,
        transferredAt,
        paymentMethod: "bank_transfer",
        rawPayload: {
          source: "ledger_integration_test",
          runKey: this.runKey
        }
      }
    });
  }

  async createLegacyCashTransaction() {
    this.transactionSequence += 1;
    const sequence = this.transactionSequence;
    return prisma.transaction.create({
      data: {
        id: `${this.entityPrefix}transaction_${sequence}`,
        gatewayRef: `${this.gatewayPrefix}-LEGACY-CASH-${sequence}-${randomUUID()}`,
        amount: 800_000,
        rawContent: `LEGACY_CASH_TEST:${this.runKey}`,
        transferredAt: new Date(Date.UTC(2026, 6, 21, 2, 0, sequence)),
        rawPayload: { method: "cash", source: "legacy_app_test" }
      }
    });
  }

  async cleanupFixtures() {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { actorUserId: this.actor.userId },
          { actorUsername: this.actor.username }
        ]
      }
    });

    // Invoices intentionally use RESTRICT so financial history cannot vanish
    // through a class/student cascade. Tests therefore remove only their own
    // namespaced invoices explicitly before deleting fixture owners.
    await prisma.monthlyInvoice.deleteMany({
      where: { enrollmentId: { startsWith: this.entityPrefix } }
    });
    await prisma.enrollmentMonth.deleteMany({
      where: { enrollmentId: { startsWith: this.entityPrefix } }
    });
    await prisma.enrollment.deleteMany({
      where: { id: { startsWith: this.entityPrefix } }
    });
    await prisma.classRoom.deleteMany({
      where: { id: { startsWith: this.entityPrefix } }
    });
    await prisma.student.deleteMany({
      where: { id: { startsWith: this.entityPrefix } }
    });
    await prisma.transaction.deleteMany({
      where: {
        OR: [
          { gatewayRef: { startsWith: this.gatewayPrefix } },
          { gatewayRef: { startsWith: `CASH-${this.entityPrefix}` } }
        ]
      }
    });
  }

  async stop() {
    await this.cleanupFixtures();
    await prisma.adminUser.deleteMany({ where: { id: this.actor.userId } });
    await prisma.$disconnect();
  }
}
