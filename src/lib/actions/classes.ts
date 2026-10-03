"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure, revalidateRosterPaths } from "@/lib/actions/shared";
import { changeArchiveState, parseArchiveInput } from "@/lib/archive";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generatePublicToken, TEACHER_TOKEN_LENGTH } from "@/lib/publicToken";
import { createClassSchema, safeParseForm, updateClassSchema } from "@/lib/validation";

export async function createClassAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createClassSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  // Mã link phụ huynh và giáo viên là hai mã ngẫu nhiên riêng; trùng (rất hiếm) thì sinh lại.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.classRoom.create({
        data: {
          name: data.name,
          shortCode: data.shortCode,
          teacherName: data.teacherName,
          pricePerSession: data.pricePerSession,
          sessionsPerMonthDefault: data.sessionsPerMonthDefault,
          teacherSharePercent: data.teacherSharePercent,
          publicToken: generatePublicToken(),
          teacherToken: generatePublicToken(TEACHER_TOKEN_LENGTH)
        }
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
  revalidatePath("/admin/classes");
  return successState(`Đã tạo lớp ${data.name} (${data.shortCode}).`);
}

export async function updateClassAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateClassSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const updated = await prisma.classRoom.updateMany({
    where: { id: data.id, archivedAt: null },
    data: {
      name: data.name,
      teacherName: data.teacherName,
      pricePerSession: data.pricePerSession,
      sessionsPerMonthDefault: data.sessionsPerMonthDefault,
      teacherSharePercent: data.teacherSharePercent
    }
  });
  if (updated.count !== 1) {
    return errorState("Lớp đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục lớp trước khi sửa.");
  }
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  revalidatePath("/admin/finance");
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
  revalidateRosterPaths();
  return successState(mode === "archive" ? "Đã lưu trữ lớp học." : "Đã khôi phục lớp học.");
}

export async function archiveClassAction(formData: FormData) {
  return changeClassArchive(formData, "archive");
}

export async function restoreClassAction(formData: FormData) {
  return changeClassArchive(formData, "restore");
}
