BEGIN;

-- Do not invent lifecycle reasons for existing financial records. Stop with an
-- actionable error if invalid void/waived rows were inserted before this
-- constraint is deployed.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MonthlyInvoice"
    WHERE "status" IN ('void'::"InvoiceStatus", 'waived'::"InvoiceStatus")
      AND (
        "statusReason" IS NULL
        OR "statusReason" !~ '[^[:space:]]'
        OR "statusChangedAt" IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'Cannot enforce invoice lifecycle metadata: void/waived invoice is missing a non-blank statusReason or statusChangedAt';
  END IF;
END $$;

-- Historical lifecycle metadata may remain after an invoice is restored or
-- paid. Only non-payable states require both fields to be present.
ALTER TABLE "MonthlyInvoice"
ADD CONSTRAINT "MonthlyInvoice_lifecycle_metadata_check"
CHECK (
  "status" NOT IN ('void'::"InvoiceStatus", 'waived'::"InvoiceStatus")
  OR (
    "statusReason" IS NOT NULL
    AND "statusReason" ~ '[^[:space:]]'
    AND "statusChangedAt" IS NOT NULL
  )
);

COMMIT;
