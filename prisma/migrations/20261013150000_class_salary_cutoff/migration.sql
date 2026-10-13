-- Ngày chốt lương đặt riêng cho một lớp trong một tháng lương (ưu tiên hơn ngày chốt chung và quy tắc của lớp).
CREATE TABLE "ClassSalaryCutoff" (
    "classId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSalaryCutoff_pkey" PRIMARY KEY ("classId","year","month")
);

ALTER TABLE "ClassSalaryCutoff" ADD CONSTRAINT "ClassSalaryCutoff_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
