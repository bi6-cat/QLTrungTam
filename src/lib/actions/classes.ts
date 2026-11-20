"use server";

import { Prisma } from "@prisma/client";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure } from "@/lib/actions/shared";
import { changeArchiveState, parseArchiveInput } from "@/lib/archive";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { diffFields, logAudit } from "@/lib/audit";
import { generatePublicToken, TEACHER_TOKEN_LENGTH } from "@/lib/publicToken";
import { createClassSchema, safeParseForm, updateClassSchema } from "@/lib/validation";

export async function createClassAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(createClassSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  // Mã link phụ huynh và giáo viên là hai mã ngẫu nhiên riêng; trùng (rất hiếm) thì sinh lại.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        const created = await tx.classRoom.create({
          data: {
            name: data.name,
            shortCode: data.shortCode,
            teacherName: data.teacherName,
            pricePerSession: data.pricePerSession,
            sessionsPerMonthDefault: data.sessionsPerMonthDefault,
            teacherSharePercent: data.teacherSharePercent,
            salaryCutoff: data.salaryCutoff,
            publicToken: generatePublicToken(),
            teacherToken: generatePublicToken(TEACHER_TOKEN_LENGTH)
          },
          select: { id: true }
        });
        await logAudit(tx, actor, {
          action: "class.created",
          entityType: "ClassRoom",
          entityId: created.id,
          metadata: {
            name: data.name,
            shortCode: data.shortCode,
            teacherName: data.teacherName,
            pricePerSession: data.pricePerSession,
            sessionsPerMonthDefault: data.sessionsPerMonthDefault,
            teacherSharePercent: data.teacherSharePercent
          }
        });
      });
      break;
    } catch (createError) {
      if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
        const target = String(createError.meta?.target ?? "");
        if (target.includes("shortCode")) {
          return errorState(`Mã lớp ${data.shortCode} đã tồn tại, hãy chọn mã khác.`);
        }
        if ((target.includes("publicToken") || target.includes("teacherToken")) && attempt < 5) continue;
      }
      return actionFailure(createError, "Không tạo được lớp.");
    }
  }
  return successState(`Đã tạo lớp ${data.name} (${data.shortCode}).`);
}

export async function updateClassAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(updateClassSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const next = {
    name: data.name,
    teacherName: data.teacherName,
    pricePerSession: data.pricePerSession,
    sessionsPerMonthDefault: data.sessionsPerMonthDefault,
    teacherSharePercent: data.teacherSharePercent,
    salaryCutoff: data.salaryCutoff
  };
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const before = await tx.classRoom.findFirst({
        where: { id: data.id, archivedAt: null },
        select: {
          name: true,
          teacherName: true,
          pricePerSession: true,
          sessionsPerMonthDefault: true,
          teacherSharePercent: true,
          salaryCutoff: true
        }
      });
      if (!before) return false;
      await tx.classRoom.update({ where: { id: data.id }, data: next });
      const changes = diffFields(before, next);
      if (Object.keys(changes).length > 0) {
        await logAudit(tx, actor, {
          action: "class.updated",
          entityType: "ClassRoom",
          entityId: data.id,
          metadata: { name: data.name, changes }
        });
      }
      return true;
    });
    if (!saved) return errorState("Lớp đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục lớp trước khi sửa.");
  } catch (updateError) {
    return actionFailure(updateError, "Không lưu được thông tin lớp.");
  }
  return successState(`Đã lưu thông tin lớp ${data.name}.`);
}

async function changeClassArchive(formData: FormData, mode: "archive" | "restore"): Promise<ResultState> {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "class", mode, id, reason, actor });
  } catch (archiveError) {
    return actionFailure(archiveError, mode === "archive" ? "Không thể lưu trữ lớp học." : "Không thể khôi phục lớp học.");
  }
  return successState(mode === "archive" ? "Đã lưu trữ lớp học." : "Đã khôi phục lớp học.");
}

export async function archiveClassAction(formData: FormData) {
  return changeClassArchive(formData, "archive");
}

export async function restoreClassAction(formData: FormData) {
  return changeClassArchive(formData, "restore");
}
