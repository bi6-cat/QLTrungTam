import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  coerceStudentImportRows,
  getImportEnrollmentValues,
  importStudentIdentityKey,
  StudentImportFileError
} from "@/lib/student-import";
import { validateStudentImportRows } from "@/lib/student-import-server";
import type {
  StudentImportCommitResult,
  StudentImportPreview
} from "@/lib/student-import-types";

export const runtime = "nodejs";

class ImportPreviewError extends Error {
  constructor(
    message: string,
    public readonly code: "IMPORT_HAS_ERRORS" | "WARNING_CONFIRMATION_REQUIRED",
    public readonly preview: StudentImportPreview
  ) {
    super(message);
    this.name = "ImportPreviewError";
  }
}

const MAX_ATTEMPTS = 3;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      rows?: unknown;
      confirmWarnings?: unknown;
      sourceFileName?: unknown;
    };
    const rows = coerceStudentImportRows(body.rows);
    const confirmWarnings = body.confirmWarnings === true;
    const sourceFileName =
      typeof body.sourceFileName === "string"
        ? body.sourceFileName.trim().slice(0, 255)
        : "";

    let result: StudentImportCommitResult | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            const preview = await validateStudentImportRows(tx, rows);
            if (preview.summary.errorCount > 0) {
              throw new ImportPreviewError(
                "Dữ liệu đã thay đổi hoặc vẫn còn lỗi. Hãy kiểm tra lại trước khi lưu.",
                "IMPORT_HAS_ERRORS",
                preview
              );
            }
            if (preview.summary.warningCount > 0 && !confirmWarnings) {
              throw new ImportPreviewError(
                "Bạn cần xác nhận đã đọc các cảnh báo trước khi lưu.",
                "WARNING_CONFIRMATION_REQUIRED",
                preview
              );
            }

            const existingStudentIds = [
              ...new Set(
                preview.rows
                  .map((row) => row.existingStudentId)
                  .filter((id): id is string => Boolean(id))
              )
            ];
            const existingEnrollments = existingStudentIds.length
              ? await tx.enrollment.findMany({
                  where: { studentId: { in: existingStudentIds } },
                  select: { studentId: true, classId: true }
                })
              : [];
            const enrollmentKeys = new Set(
              existingEnrollments.map((item) => `${item.studentId}\u0000${item.classId}`)
            );
            const studentIdByIdentity = new Map<string, string>();
            const reusedStudentIds = new Set<string>();
            const newStudentRows = new Map<
              string,
              (typeof preview.rows)[number]
            >();

            for (const row of preview.rows) {
              const identity = importStudentIdentityKey(row);
              if (row.existingStudentId) {
                studentIdByIdentity.set(identity, row.existingStudentId);
                reusedStudentIds.add(row.existingStudentId);
              } else if (!newStudentRows.has(identity)) {
                newStudentRows.set(identity, row);
              }
            }

            const createdStudents = newStudentRows.size
              ? await tx.student.createManyAndReturn({
                  data: [...newStudentRows.values()].map((row) => ({
                    fullName: row.fullName,
                    phone: row.phone,
                    parentName: row.parentName || null,
                    address: row.address,
                    note: row.note || null
                  })),
                  select: { id: true, fullName: true, phone: true }
                })
              : [];
            const createdStudentIds = createdStudents.map((student) => student.id);
            for (const student of createdStudents) {
              studentIdByIdentity.set(importStudentIdentityKey(student), student.id);
            }

            const enrollmentsToCreate: Array<{
              studentId: string;
              classId: string;
              status: "active" | "on_leave";
              sessionsOverride: number | null;
            }> = [];
            let skippedEnrollments = 0;

            for (const row of preview.rows) {
              const identity = importStudentIdentityKey(row);
              const studentId = studentIdByIdentity.get(identity);
              if (!studentId) throw new Error("STUDENT_IMPORT_IDENTITY_MAPPING_FAILED");

              const { status, sessionsOverride } = getImportEnrollmentValues(row);
              for (const classRoom of row.resolvedClasses) {
                const enrollmentKey = `${studentId}\u0000${classRoom.id}`;
                if (enrollmentKeys.has(enrollmentKey)) {
                  skippedEnrollments += 1;
                  continue;
                }
                enrollmentsToCreate.push({
                  studentId,
                  classId: classRoom.id,
                  status,
                  sessionsOverride
                });
                enrollmentKeys.add(enrollmentKey);
              }
            }
            if (enrollmentsToCreate.length > 0) {
              await tx.enrollment.createMany({ data: enrollmentsToCreate });
            }
            const createdEnrollments = enrollmentsToCreate.length;

            const batchId = randomUUID();
            await tx.auditLog.create({
              data: {
                actorUserId: session.userId,
                actorUsername: session.username.trim(),
                action: "student.bulk_imported",
                entityType: "StudentImport",
                entityId: batchId,
                reason: "Nhập học sinh và ghi danh từ Excel",
                metadata: {
                  sourceFileName: sourceFileName || null,
                  sourceRows: preview.summary.totalRows,
                  createdStudents: createdStudentIds.length,
                  reusedStudents: reusedStudentIds.size,
                  createdEnrollments,
                  skippedEnrollments,
                  warningCount: preview.summary.warningCount,
                  studentIds: [...createdStudentIds, ...reusedStudentIds]
                }
              }
            });

            return {
              ok: true,
              batchId,
              createdStudents: createdStudentIds.length,
              reusedStudents: reusedStudentIds.size,
              createdEnrollments,
              skippedEnrollments
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5_000,
            timeout: 30_000
          }
        );
        break;
      } catch (error) {
        if (error instanceof ImportPreviewError) throw error;
        const retryable =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          (error.code === "P2034" || error.code === "P2002");
        if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      }
    }

    if (!result) {
      return NextResponse.json(
        { error: "Không thể hoàn tất do dữ liệu đang được thay đổi. Hãy thử lại." },
        { status: 409 }
      );
    }
    revalidatePath("/admin");
    revalidatePath("/admin/students");
    revalidatePath("/admin/classes");
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ImportPreviewError) {
      return NextResponse.json(
        { error: error.message, code: error.code, preview: error.preview },
        { status: 409 }
      );
    }
    if (error instanceof StudentImportFileError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
    }
    const isConflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002");
    if (isConflict) {
      return NextResponse.json(
        { error: "Dữ liệu vừa được thay đổi bởi thao tác khác. Hãy kiểm tra lại rồi thử lại." },
        { status: 409 }
      );
    }
    console.error("Student import failed", error);
    return NextResponse.json({ error: "Không thể lưu dữ liệu nhập." }, { status: 500 });
  }
}
