BEGIN;

ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_classId_fkey";
ALTER TABLE "Enrollment" DROP CONSTRAINT "Enrollment_studentId_fkey";

ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_classId_fkey"
FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
