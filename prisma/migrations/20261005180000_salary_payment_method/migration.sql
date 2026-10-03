-- Lương giáo viên trả bằng chuyển khoản hoặc tiền mặt (cột "Chuyển thêm" trong sổ tay).
ALTER TABLE "Expense" ADD COLUMN "paymentMethod" "PaymentMethod";

-- Bản ghi lương cũ coi như chuyển khoản.
UPDATE "Expense" SET "paymentMethod" = 'bank_transfer' WHERE "category" = 'teacher_salary';
