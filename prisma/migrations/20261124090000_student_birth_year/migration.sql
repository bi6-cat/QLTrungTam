-- Năm sinh học sinh (không bắt buộc), để phân biệt học sinh trùng tên.
ALTER TABLE "Student" ADD COLUMN "birthYear" INTEGER;

-- Điền sẵn cho học sinh đang học: khối lớp là số 1–12 ở cuối tên lớp ("K26 - Toán 12"),
-- năm sinh = năm bắt đầu năm học (từ tháng 8, giờ Việt Nam) − khối − 5. Nhiều lớp thì lấy khối cao nhất.
WITH grades AS (
  SELECT e."studentId",
         MAX((substring(c."name" from '(?:^|\D)(\d{1,2})\s*[A-Za-z]?\s*$'))::int) AS grade
  FROM "Enrollment" e
  JOIN "ClassRoom" c ON c."id" = e."classId"
  WHERE e."leftAt" IS NULL
    AND c."archivedAt" IS NULL
    AND substring(c."name" from '(?:^|\D)(\d{1,2})\s*[A-Za-z]?\s*$') IS NOT NULL
    AND (substring(c."name" from '(?:^|\D)(\d{1,2})\s*[A-Za-z]?\s*$'))::int BETWEEN 1 AND 12
  GROUP BY e."studentId"
),
school AS (
  SELECT CASE
           WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')) >= 8
             THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int
           ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int - 1
         END AS start_year
)
UPDATE "Student" s
SET "birthYear" = school.start_year - grades.grade - 5
FROM grades, school
WHERE s."id" = grades."studentId" AND s."birthYear" IS NULL;
