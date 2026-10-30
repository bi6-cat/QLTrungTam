-- Cổng học tập: bật tính năng từ vựng theo giáo viên; mã học sinh dạng tên rút gọn,
-- đăng nhập không phân biệt hoa thường qua codeKey.
ALTER TABLE "Teacher" ADD COLUMN "vocabEnabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StudentAccount" ADD COLUMN "codeKey" TEXT;
UPDATE "StudentAccount" SET "codeKey" = lower("code");
ALTER TABLE "StudentAccount" ALTER COLUMN "codeKey" SET NOT NULL;
CREATE UNIQUE INDEX "StudentAccount_codeKey_key" ON "StudentAccount"("codeKey");
