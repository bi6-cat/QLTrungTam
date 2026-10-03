BEGIN;

-- Học sinh nghỉ một lớp (không phải lưu trữ cả hồ sơ): ngày đầu của tháng đầu tiên
-- không còn học. Null = đang học.
ALTER TABLE "Enrollment"
ADD COLUMN "leftAt" TIMESTAMP(3);

-- Lương giáo viên: mỗi hóa đơn đã thu được tính vào đúng một bản ghi lương, để tiền
-- đóng muộn gộp sang lương tháng sau mà không bị trả hai lần.
ALTER TABLE "Expense"
ADD COLUMN "lateBaseAmount" INTEGER;

ALTER TABLE "MonthlyInvoice"
ADD COLUMN "salaryExpenseId" TEXT;

CREATE INDEX "MonthlyInvoice_salaryExpenseId_idx"
ON "MonthlyInvoice"("salaryExpenseId");

ALTER TABLE "MonthlyInvoice"
ADD CONSTRAINT "MonthlyInvoice_salaryExpenseId_fkey"
FOREIGN KEY ("salaryExpenseId") REFERENCES "Expense"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Gắn hóa đơn cũ vào bản ghi lương đã tạo: hóa đơn cùng lớp, cùng kỳ, đã thu trước
-- lúc tạo bản ghi lương là phần đã trả cho giáo viên. Hóa đơn thu sau thời điểm đó
-- để trống, lần tính lương kế tiếp sẽ gộp vào cột thu muộn.
UPDATE "MonthlyInvoice" AS mi
SET "salaryExpenseId" = salary."id"
FROM (
  SELECT DISTINCT ON (e."classId", e."month", e."year")
    e."id", e."classId", e."month", e."year", e."createdAt"
  FROM "Expense" AS e
  WHERE e."category" = 'teacher_salary'
    AND e."classId" IS NOT NULL
  ORDER BY e."classId", e."month", e."year", e."createdAt" ASC
) AS salary,
"Enrollment" AS en
WHERE mi."enrollmentId" = en."id"
  AND en."classId" = salary."classId"
  AND mi."month" = salary."month"
  AND mi."year" = salary."year"
  AND mi."status" = 'paid'
  AND mi."paidAt" IS NOT NULL
  AND mi."paidAt" <= salary."createdAt";

COMMIT;
