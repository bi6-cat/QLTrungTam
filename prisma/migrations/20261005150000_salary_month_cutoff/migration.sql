-- Ngày chốt lương đặt riêng cho từng tháng (dùng để khớp các tháng trả lương khác ngày thường lệ).
CREATE TABLE "SalaryMonthCutoff" (
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalaryMonthCutoff_pkey" PRIMARY KEY ("year","month")
);
