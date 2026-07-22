import type { Prisma } from "@prisma/client";
import {
  buildStudentImportPreview,
  normalizeImportPhone,
  splitImportClassCodes
} from "@/lib/student-import";
import type { StudentImportDraftRow } from "@/lib/student-import-types";

type StudentImportDb = Pick<Prisma.TransactionClient, "classRoom" | "student">;

export async function validateStudentImportRows(
  db: StudentImportDb,
  rows: StudentImportDraftRow[]
) {
  const classCodes = [
    ...new Set(rows.flatMap((row) => splitImportClassCodes(row.classCodes)))
  ];
  const phones = [
    ...new Set(rows.map((row) => normalizeImportPhone(row.phone)).filter(Boolean))
  ];
  const [classes, existingStudents] = await Promise.all([
    classCodes.length
      ? db.classRoom.findMany({
          where: { shortCode: { in: classCodes } },
          select: { id: true, name: true, shortCode: true, archivedAt: true }
        })
      : Promise.resolve([]),
    phones.length
      ? db.student.findMany({
          where: { phone: { in: phones } },
          select: {
            id: true,
            fullName: true,
            phone: true,
            archivedAt: true,
            enrollments: { select: { classId: true } }
          }
        })
      : Promise.resolve([])
  ]);

  return buildStudentImportPreview({ rows, classes, existingStudents });
}
