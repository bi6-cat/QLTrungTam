BEGIN;

-- Link nộp tiền và link giáo viên trước đây dùng chung một mã 4 ký tự. Tách thành
-- hai mã ngẫu nhiên dài; mã cũ giữ ở legacyToken để chuyển hướng tạm sang link mới.
ALTER TABLE "ClassRoom" ADD COLUMN "teacherToken" TEXT;
ALTER TABLE "ClassRoom" ADD COLUMN "legacyToken" TEXT;

-- Cùng bảng chữ với src/lib/publicToken.ts (bỏ 0 O 1 I l). Hàm tạm, mất khi hết phiên.
CREATE FUNCTION pg_temp.qltt_random_token(len INTEGER) RETURNS TEXT
LANGUAGE sql VOLATILE AS $$
  SELECT string_agg(
    substr('23456789abcdefghjkmnpqrstuvwxyz', (get_byte(uuid_send(gen_random_uuid()), 0) % 31) + 1, 1),
    ''
  )
  FROM generate_series(1, len)
$$;

UPDATE "ClassRoom"
SET "legacyToken" = "publicToken",
    "publicToken" = pg_temp.qltt_random_token(10),
    "teacherToken" = pg_temp.qltt_random_token(16);

ALTER TABLE "ClassRoom" ALTER COLUMN "teacherToken" SET NOT NULL;

CREATE UNIQUE INDEX "ClassRoom_teacherToken_key" ON "ClassRoom"("teacherToken");
CREATE UNIQUE INDEX "ClassRoom_legacyToken_key" ON "ClassRoom"("legacyToken");

COMMIT;
