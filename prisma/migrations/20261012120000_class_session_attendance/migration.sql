-- Lịch cố định có khoảng hiệu lực; ngừng lịch thì đóng khoảng thay vì xóa, nên một lớp có thể
-- có hai lịch cùng thứ + giờ ở hai khoảng khác nhau (ứng dụng tự chặn trùng khoảng).
ALTER TABLE "ClassSchedule" ADD COLUMN "effectiveFrom" DATE;
ALTER TABLE "ClassSchedule" ADD COLUMN "effectiveTo" DATE;
DROP INDEX "ClassSchedule_classId_weekday_startTime_key";
DROP INDEX IF EXISTS "ClassSchedule_classId_idx";
CREATE INDEX "ClassSchedule_classId_weekday_idx" ON "ClassSchedule"("classId", "weekday");

-- Điểm danh buổi học của lớp (đã học / lớp nghỉ / học bù).
CREATE TYPE "ClassSessionStatus" AS ENUM ('held', 'cancelled', 'makeup');

CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL DEFAULT '',
    "status" "ClassSessionStatus" NOT NULL,
    "reason" TEXT,
    "makeupForDate" DATE,
    "markedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassSession_classId_date_startTime_key" ON "ClassSession"("classId", "date", "startTime");
CREATE INDEX "ClassSession_date_idx" ON "ClassSession"("date");

ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Diễn giải số buổi của hóa đơn (lý do trừ buổi) để đưa vào tin nhắn nhắc học phí.
ALTER TABLE "MonthlyInvoice" ADD COLUMN "sessionsNote" TEXT;
