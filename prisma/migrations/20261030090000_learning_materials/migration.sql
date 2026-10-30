-- Học tập: tài liệu giáo viên chia sẻ cho lớp (đường dẫn và/hoặc ghi chú, không lưu file).
-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id"),
    -- Chặn đường dẫn javascript:/data: lọt vào thẻ <a> ở cổng học sinh dù app có bỏ sót kiểm tra.
    CONSTRAINT "Material_url_http_check" CHECK ("url" IS NULL OR "url" ~ '^https?://'),
    CONSTRAINT "Material_content_check" CHECK ("url" IS NOT NULL OR "note" <> '')
);

-- CreateIndex
CREATE INDEX "Material_classId_createdAt_idx" ON "Material"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "Material_teacherId_idx" ON "Material"("teacherId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
