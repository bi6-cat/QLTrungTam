-- Bỏ qua dư nợ lương của một lớp-tháng (tháng trả lệch đã thỏa thuận xong với giáo viên).
CREATE TABLE "SalaryWriteOff" (
    "classId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryWriteOff_pkey" PRIMARY KEY ("classId","year","month")
);

ALTER TABLE "SalaryWriteOff" ADD CONSTRAINT "SalaryWriteOff_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
