-- PostgreSQL allows enum values to be added inside a transaction, but they
-- cannot be referenced until that transaction commits. Commit this small enum
-- expansion before the main atomic migration, which uses the values in a CHECK.
BEGIN;

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'void';
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'waived';

COMMIT;

-- All remaining changes and data backfills are atomic. If a legacy invoice is
-- outside the supported monthly bounds, these changes roll back together.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MonthlyInvoice"
    WHERE "month" NOT BETWEEN 1 AND 12
      OR "year" NOT BETWEEN 2000 AND 2100
      OR "sessions" NOT BETWEEN 0 AND 60
      OR "pricePerSession" NOT BETWEEN 0 AND 1000000000
  ) THEN
    RAISE EXCEPTION 'Cannot backfill EnrollmentMonth: invoice month, year, sessions, or price is outside supported bounds';
  END IF;
END $$;

-- Expand MonthlyInvoice with nullable snapshots so the previous application
-- version can continue inserting invoices during a rolling deployment.
ALTER TABLE "MonthlyInvoice"
ADD COLUMN "studentNameSnapshot" TEXT,
ADD COLUMN "studentPhoneSnapshot" TEXT,
ADD COLUMN "classNameSnapshot" TEXT,
ADD COLUMN "classShortCodeSnapshot" TEXT,
ADD COLUMN "teacherNameSnapshot" TEXT,
ADD COLUMN "statusReason" TEXT,
ADD COLUMN "statusChangedAt" TIMESTAMP(3);

-- Historical names were not previously stored on invoices. Capture the best
-- available related values now; new application writes will snapshot at issue
-- time instead of following later Student/ClassRoom edits.
UPDATE "MonthlyInvoice" AS invoice
SET
  "studentNameSnapshot" = student."fullName",
  "studentPhoneSnapshot" = student."phone",
  "classNameSnapshot" = classroom."name",
  "classShortCodeSnapshot" = classroom."shortCode",
  "teacherNameSnapshot" = classroom."teacherName"
FROM "Enrollment" AS enrollment
JOIN "Student" AS student
  ON student."id" = enrollment."studentId"
JOIN "ClassRoom" AS classroom
  ON classroom."id" = enrollment."classId"
WHERE invoice."enrollmentId" = enrollment."id";

-- CreateTable
CREATE TABLE "EnrollmentMonth" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'active',
    "sessions" INTEGER NOT NULL,
    "pricePerSession" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentMonth_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EnrollmentMonth_month_check" CHECK ("month" BETWEEN 1 AND 12),
    CONSTRAINT "EnrollmentMonth_year_check" CHECK ("year" BETWEEN 2000 AND 2100),
    CONSTRAINT "EnrollmentMonth_sessions_check" CHECK ("sessions" BETWEEN 0 AND 60),
    CONSTRAINT "EnrollmentMonth_pricePerSession_check" CHECK ("pricePerSession" BETWEEN 0 AND 1000000000)
);

-- An invoice proves that an enrollment was billed as active for that month.
-- Do not infer historical state or price from current Enrollment/ClassRoom data.
INSERT INTO "EnrollmentMonth" (
  "id",
  "enrollmentId",
  "month",
  "year",
  "status",
  "sessions",
  "pricePerSession",
  "createdAt",
  "updatedAt"
)
SELECT
  'backfill_' || invoice."id",
  invoice."enrollmentId",
  invoice."month",
  invoice."year",
  'active'::"EnrollmentStatus",
  invoice."sessions",
  invoice."pricePerSession",
  invoice."createdAt",
  invoice."updatedAt"
FROM "MonthlyInvoice" AS invoice;

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentMonth_enrollmentId_month_year_key"
ON "EnrollmentMonth"("enrollmentId", "month", "year");

CREATE INDEX "EnrollmentMonth_year_month_status_idx"
ON "EnrollmentMonth"("year", "month", "status");

-- AddForeignKey
ALTER TABLE "EnrollmentMonth"
ADD CONSTRAINT "EnrollmentMonth_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- A void or waived invoice is not a settled payment and therefore cannot keep
-- a payment reference or paid timestamp. Nullable snapshots remain unrestricted
-- during this expand phase for compatibility with the previous application.
ALTER TABLE "MonthlyInvoice"
ADD CONSTRAINT "MonthlyInvoice_nonpayable_status_check"
CHECK (
  "status" NOT IN ('void'::"InvoiceStatus", 'waived'::"InvoiceStatus")
  OR ("transactionId" IS NULL AND "paidAt" IS NULL)
);

COMMIT;
