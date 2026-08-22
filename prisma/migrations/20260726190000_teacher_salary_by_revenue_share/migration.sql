-- Lương giáo viên chuyển từ "đơn giá mỗi buổi" sang "phần trăm học phí đã thu
-- của lớp". Mỗi lớp có tỷ lệ riêng.
ALTER TABLE "ClassRoom" DROP COLUMN "teacherRatePerSession";
ALTER TABLE "ClassRoom" ADD COLUMN "teacherSharePercent" INTEGER NOT NULL DEFAULT 0;

-- Bản ghi chi phí lương lưu lại cách tính: % chia và số tiền gốc.
ALTER TABLE "Expense" DROP COLUMN "sessions";
ALTER TABLE "Expense" DROP COLUMN "ratePerSession";
ALTER TABLE "Expense" ADD COLUMN "sharePercent" INTEGER;
ALTER TABLE "Expense" ADD COLUMN "baseAmount" INTEGER;
