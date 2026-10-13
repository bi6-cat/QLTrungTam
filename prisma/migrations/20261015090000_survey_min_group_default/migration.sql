-- Chủ trung tâm muốn xem kết quả cả khi lớp mới có ít phiếu: ngưỡng mặc định 3 -> 1 (luôn hiện).
ALTER TABLE "Survey" ALTER COLUMN "minGroupSize" SET DEFAULT 1;

-- Các khảo sát đang để ngưỡng mặc định cũ cũng chuyển sang 1.
UPDATE "Survey" SET "minGroupSize" = 1 WHERE "minGroupSize" = 3;
