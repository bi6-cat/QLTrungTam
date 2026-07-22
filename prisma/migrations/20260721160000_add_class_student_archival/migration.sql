BEGIN;

ALTER TABLE "ClassRoom"
ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "Student"
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "ClassRoom_archivedAt_idx"
ON "ClassRoom"("archivedAt");

CREATE INDEX "Student_archivedAt_idx"
ON "Student"("archivedAt");

COMMIT;
