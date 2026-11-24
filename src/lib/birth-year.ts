import type { Prisma } from "@prisma/client";

/**
 * Năm sinh học sinh. Không nhập tay thì tự đoán theo lớp đang học: khối lớp là số 1–12 ở cuối tên
 * lớp ("K26 - Toán 12" -> 12), năm sinh = năm bắt đầu năm học − khối − 5 (vào lớp 1 năm 6 tuổi).
 * Năm học bắt đầu từ tháng 8: tháng 11/2026 thuộc năm học 2026–2027, lớp 10 -> sinh 2011.
 */
export function gradeFromClassName(name: string): number | null {
  const match = name.trim().match(/(?:^|\D)(\d{1,2})\s*[A-Za-z]?\s*$/);
  if (!match) return null;
  const grade = Number(match[1]);
  return grade >= 1 && grade <= 12 ? grade : null;
}

export function schoolYearStart(date = new Date()) {
  const vietnam = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const year = vietnam.getUTCFullYear();
  return vietnam.getUTCMonth() + 1 >= 8 ? year : year - 1;
}

export function birthYearForGrade(grade: number, date = new Date()) {
  return schoolYearStart(date) - grade - 5;
}

/** Năm sinh đoán từ các lớp đang học; các lớp đoán ra khác nhau thì lấy khối cao nhất. */
export function estimateBirthYear(classNames: string[], date = new Date()): number | null {
  const grades = classNames.map(gradeFromClassName).filter((grade): grade is number => grade !== null);
  if (grades.length === 0) return null;
  return birthYearForGrade(Math.max(...grades), date);
}

export const BIRTH_YEAR_MIN = 1950;
export function birthYearMax(date = new Date()) {
  return date.getFullYear();
}

/**
 * Điền năm sinh còn trống cho các học sinh, đoán theo lớp đang học (chưa nghỉ, lớp chưa lưu trữ).
 * Học sinh đã có năm sinh (nhập tay hoặc đã đoán trước đó) giữ nguyên.
 */
export async function fillMissingBirthYears(
  tx: Pick<Prisma.TransactionClient, "student">,
  studentIds: string[],
  date = new Date()
) {
  if (studentIds.length === 0) return;
  const students = await tx.student.findMany({
    where: { id: { in: studentIds }, birthYear: null },
    select: {
      id: true,
      enrollments: {
        where: { leftAt: null, classRoom: { archivedAt: null } },
        select: { classRoom: { select: { name: true } } }
      }
    }
  });
  for (const student of students) {
    const birthYear = estimateBirthYear(
      student.enrollments.map((enrollment) => enrollment.classRoom.name),
      date
    );
    if (birthYear === null) continue;
    await tx.student.updateMany({ where: { id: student.id, birthYear: null }, data: { birthYear } });
  }
}
