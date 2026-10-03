-- Lương giáo viên ghi theo từng lần chuyển tiền: lưu ngày chuyển thực tế.
ALTER TABLE "Expense" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Bản ghi lương cũ: coi ngày ghi là ngày chuyển.
UPDATE "Expense" SET "paidAt" = "createdAt" WHERE "category" = 'teacher_salary';
