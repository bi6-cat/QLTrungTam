-- Nhật ký thay đổi: gắn lớp/học sinh liên quan để lọc nhanh trên trang /admin/logs.
ALTER TABLE "AuditLog" ADD COLUMN "classId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "studentId" TEXT;

CREATE INDEX "AuditLog_classId_createdAt_idx" ON "AuditLog"("classId", "createdAt");
CREATE INDEX "AuditLog_studentId_createdAt_idx" ON "AuditLog"("studentId", "createdAt");

-- Điền lớp/học sinh cho các log cũ.
UPDATE "AuditLog" a SET "classId" = a."entityId"
WHERE a."entityType" = 'ClassRoom';

UPDATE "AuditLog" a SET "studentId" = a."entityId"
WHERE a."entityType" = 'Student';

UPDATE "AuditLog" a SET "classId" = e."classId", "studentId" = e."studentId"
FROM "Enrollment" e
WHERE a."entityType" = 'Enrollment' AND a."entityId" = e."id";

UPDATE "AuditLog" a SET "classId" = e."classId", "studentId" = e."studentId"
FROM "MonthlyInvoice" i JOIN "Enrollment" e ON e."id" = i."enrollmentId"
WHERE a."entityType" = 'MonthlyInvoice' AND a."entityId" = i."id";

UPDATE "AuditLog" a SET "classId" = e."classId", "studentId" = e."studentId"
FROM "MonthlyInvoice" i JOIN "Enrollment" e ON e."id" = i."enrollmentId"
WHERE a."entityType" = 'Transaction' AND a."metadata" ->> 'invoiceId' = i."id";
