BEGIN;

-- Ngày bắt đầu học của từng ghi danh; học sinh cũ lấy theo ngày ghi danh.
ALTER TABLE "Enrollment"
ADD COLUMN "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Enrollment" SET "startDate" = "createdAt";

-- Số tiền thực nhận của hóa đơn đã thu: theo giao dịch đã gán, không có thì bằng số tiền hóa đơn.
ALTER TABLE "MonthlyInvoice" ADD COLUMN "paidAmount" INTEGER;

UPDATE "MonthlyInvoice" AS mi
SET "paidAmount" = COALESCE(
  (SELECT t."amount" FROM "Transaction" AS t WHERE t."id" = mi."transactionId"),
  mi."amount"
)
WHERE mi."status" = 'paid';

-- Lương giáo viên chuyển sang tính theo đúng kỳ học phí (thu muộn chốt bổ sung trong cùng kỳ),
-- không còn gộp tiền thu muộn sang tháng sau nên bỏ liên kết hóa đơn ↔ bản ghi lương.
ALTER TABLE "MonthlyInvoice" DROP CONSTRAINT "MonthlyInvoice_salaryExpenseId_fkey";
DROP INDEX "MonthlyInvoice_salaryExpenseId_idx";
ALTER TABLE "MonthlyInvoice" DROP COLUMN "salaryExpenseId";
ALTER TABLE "Expense" DROP COLUMN "lateBaseAmount";

COMMIT;
