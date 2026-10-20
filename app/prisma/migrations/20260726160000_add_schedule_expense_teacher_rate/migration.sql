-- Đơn giá trả giáo viên mỗi buổi dạy. Mặc định 0 để dữ liệu cũ không đổi hành vi.
ALTER TABLE "ClassRoom" ADD COLUMN "teacherRatePerSession" INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Lịch học cố định lặp theo tuần
-- ---------------------------------------------------------------------------
CREATE TABLE "ClassSchedule" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "room" TEXT NOT NULL DEFAULT '',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClassSchedule_classId_weekday_startTime_key"
    ON "ClassSchedule"("classId", "weekday", "startTime");
CREATE INDEX "ClassSchedule_classId_idx" ON "ClassSchedule"("classId");
CREATE INDEX "ClassSchedule_weekday_idx" ON "ClassSchedule"("weekday");

ALTER TABLE "ClassSchedule"
    ADD CONSTRAINT "ClassSchedule_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Chi phí vận hành theo tháng
-- ---------------------------------------------------------------------------
CREATE TYPE "ExpenseCategory" AS ENUM (
    'teacher_salary', 'rent', 'utilities', 'supplies', 'marketing', 'other'
);

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'other',
    "classId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sessions" INTEGER,
    "ratePerSession" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Expense_year_month_idx" ON "Expense"("year", "month");
CREATE INDEX "Expense_category_year_month_idx" ON "Expense"("category", "year", "month");
CREATE INDEX "Expense_classId_idx" ON "Expense"("classId");

ALTER TABLE "Expense"
    ADD CONSTRAINT "Expense_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
