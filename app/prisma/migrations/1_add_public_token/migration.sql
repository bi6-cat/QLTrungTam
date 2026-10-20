-- Add public access token for parent/teacher links (anti-enumeration).
ALTER TABLE "ClassRoom" ADD COLUMN "publicToken" TEXT;

-- Backfill existing rows with a random unguessable token.
UPDATE "ClassRoom"
SET "publicToken" = 'tok_' || md5(random()::text || clock_timestamp()::text || "id")
WHERE "publicToken" IS NULL;

ALTER TABLE "ClassRoom" ALTER COLUMN "publicToken" SET NOT NULL;

CREATE UNIQUE INDEX "ClassRoom_publicToken_key" ON "ClassRoom"("publicToken");
CREATE INDEX "ClassRoom_publicToken_idx" ON "ClassRoom"("publicToken");
