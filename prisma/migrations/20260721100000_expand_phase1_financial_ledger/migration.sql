-- Keep the expand migration atomic. If legacy duplicate links prevent either
-- unique index from being created, PostgreSQL rolls every schema change back.
BEGIN;

-- Abort before making changes when Phase 0 reconciliation has not resolved
-- duplicate legacy links. The unique indexes below are the final guardrail.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Transaction"
    WHERE "matchedInvoiceId" IS NOT NULL
    GROUP BY "matchedInvoiceId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique Transaction.matchedInvoiceId: duplicate invoice links exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MonthlyInvoice"
    WHERE "transactionId" IS NOT NULL
    GROUP BY "transactionId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique MonthlyInvoice.transactionId: duplicate transaction links exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MonthlyInvoice" AS invoice
    JOIN "Transaction" AS transaction_row
      ON transaction_row."id" = invoice."transactionId"
    WHERE invoice."transactionId" IS NOT NULL
      AND transaction_row."matchedInvoiceId" IS DISTINCT FROM invoice."id"
  ) OR EXISTS (
    SELECT 1
    FROM "Transaction" AS transaction_row
    JOIN "MonthlyInvoice" AS invoice
      ON invoice."id" = transaction_row."matchedInvoiceId"
    WHERE transaction_row."matchedInvoiceId" IS NOT NULL
      AND invoice."transactionId" IS DISTINCT FROM transaction_row."id"
  ) THEN
    RAISE EXCEPTION 'Cannot expand financial ledger: transaction-invoice links are not reciprocal';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Transaction"
    WHERE "matchedInvoiceId" IS NOT NULL
      AND "resolvedAt" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Cannot enforce transaction state: a matched transaction is also resolved';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'cash');

-- Expand Transaction with nullable columns first so existing rows remain valid
-- while the payment method is backfilled.
ALTER TABLE "Transaction"
ADD COLUMN "paymentMethod" "PaymentMethod",
ADD COLUMN "matchedAt" TIMESTAMP(3),
ADD COLUMN "matchReason" TEXT,
ADD COLUMN "matchOverrideReason" TEXT,
ADD COLUMN "reversedAt" TIMESTAMP(3),
ADD COLUMN "reversalReason" TEXT,
ADD COLUMN "resolvedNote" TEXT;

-- Cash transactions created by the current application can be identified by
-- either the persisted method marker or their generated gateway reference.
-- All remaining historical rows are bank transfers.
UPDATE "Transaction"
SET "paymentMethod" = CASE
  WHEN "rawPayload"->>'method' = 'cash' OR "gatewayRef" LIKE 'CASH-%'
    THEN 'cash'::"PaymentMethod"
  ELSE 'bank_transfer'::"PaymentMethod"
END;

ALTER TABLE "Transaction"
ALTER COLUMN "paymentMethod" SET DEFAULT 'bank_transfer',
ALTER COLUMN "paymentMethod" SET NOT NULL;

-- Preserve useful match timestamps for legacy links. Future mutations write a
-- more specific reason and timestamp in application code.
UPDATE "Transaction" AS txrow
SET
  "matchedAt" = COALESCE(invoice."paidAt", txrow."transferredAt", txrow."createdAt"),
  "matchReason" = COALESCE(txrow."matchReason", 'legacy_backfill')
FROM "MonthlyInvoice" AS invoice
WHERE txrow."matchedInvoiceId" = invoice."id"
  AND txrow."matchedAt" IS NULL;

-- A matched transaction may not simultaneously be resolved or reversed. This
-- also prevents a rolled-back legacy app from reassigning a reversed record,
-- because reversal deliberately keeps resolvedAt populated for compatibility.
ALTER TABLE "Transaction"
ADD CONSTRAINT "Transaction_financial_state_check"
CHECK (
  "matchedInvoiceId" IS NULL
  OR ("resolvedAt" IS NULL AND "reversedAt" IS NULL)
);

-- If code is temporarily rolled back, its cash path does not know the new
-- paymentMethod column. Classify those inserts from the legacy markers at the
-- database boundary so reports remain correct after rolling forward again.
CREATE FUNCTION "classify_transaction_payment_method"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."gatewayRef" LIKE 'CASH-%' OR NEW."rawPayload"->>'method' = 'cash' THEN
    NEW."paymentMethod" := 'cash'::"PaymentMethod";
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Transaction_classify_payment_method"
BEFORE INSERT ON "Transaction"
FOR EACH ROW
EXECUTE FUNCTION "classify_transaction_payment_method"();

-- Financial invoices must outlive class/student cleanup. ClassRoom and Student
-- may still cascade to Enrollment when no invoice exists, but PostgreSQL now
-- rejects the cascade atomically as soon as an invoice would be deleted.
ALTER TABLE "MonthlyInvoice"
DROP CONSTRAINT "MonthlyInvoice_enrollmentId_fkey";

ALTER TABLE "MonthlyInvoice"
ADD CONSTRAINT "MonthlyInvoice_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enforce one transaction per invoice in both legacy and new relation
-- directions during the dual-write rollout. PostgreSQL allows multiple NULLs
-- in each unique index, so unmatched transactions/invoices remain supported.
CREATE UNIQUE INDEX "Transaction_matchedInvoiceId_key"
ON "Transaction"("matchedInvoiceId");

CREATE UNIQUE INDEX "MonthlyInvoice_transactionId_key"
ON "MonthlyInvoice"("transactionId");

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx"
ON "AuditLog"("entityType", "entityId", "createdAt");

CREATE INDEX "AuditLog_actorUserId_createdAt_idx"
ON "AuditLog"("actorUserId", "createdAt");

CREATE INDEX "AuditLog_action_createdAt_idx"
ON "AuditLog"("action", "createdAt");

CREATE INDEX "AuditLog_createdAt_idx"
ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditLog"
ADD CONSTRAINT "AuditLog_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "AdminUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
