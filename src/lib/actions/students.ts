"use server";

import { errorState, successState, type CreateStudentState, type ResultState } from "@/lib/action-states";
import { actionFailure } from "@/lib/actions/shared";
import { changeArchiveState, parseArchiveInput } from "@/lib/archive";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncUnpaidInvoicesWithStudent } from "@/lib/student-invoice-sync";
import { diffFields, logAudit } from "@/lib/audit";
import { createStudentRecord } from "@/lib/students-core";
import { fillMissingBirthYears } from "@/lib/birth-year";
import { createStudentSchema, safeParseForm, updateStudentSchema } from "@/lib/validation";

/** Thêm học sinh thủ công, chặn trùng hồ sơ (quy tắc trong createStudentRecord). */
export async function createStudentAction(
  _prevState: CreateStudentState,
  formData: FormData
): Promise<CreateStudentState> {
  const actor = await requireStaff();
  const { data, error } = safeParseForm(createStudentSchema, formData);
  if (error || !data) {
    return { warning: "", success: "", error: error ?? "Dữ liệu không hợp lệ." };
  }
  try {
    const result = await createStudentRecord(data, actor);
    if (!result.ok) return { warning: "", success: "", error: result.error };
    return { error: "", success: `Đã thêm học sinh ${result.fullName}.`, warning: result.warning };
  } catch (createError) {
    return { warning: "", success: "", error: actionFailure(createError, "Không thể thêm học sinh.").error };
  }
}

export async function updateStudentAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireStaff();
  const { data, error } = safeParseForm(updateStudentSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  let changedMemos: Array<{ from: string; to: string }>;
  try {
    changedMemos = await prisma.$transaction(async (tx) => {
      const before = await tx.student.findUnique({
        where: { id: data.id },
        select: { fullName: true, phone: true, address: true, parentName: true, birthYear: true, note: true }
      });
      const updated = await tx.student.updateMany({
        where: { id: data.id, archivedAt: null },
        data: {
          fullName: data.fullName,
          phone: data.phone,
          address: data.address,
          parentName: data.parentName,
          birthYear: data.birthYear,
          note: data.note
        }
      });
      if (updated.count !== 1) {
        throw new Error("Học sinh đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục hồ sơ trước khi sửa.");
      }
      const changes = before
        ? diffFields(before, {
            fullName: data.fullName,
            phone: data.phone,
            address: data.address,
            parentName: data.parentName ?? null,
            ...(data.birthYear !== undefined ? { birthYear: data.birthYear } : {}),
            note: data.note ?? null
          })
        : {};
      if (Object.keys(changes).length > 0) {
        await logAudit(tx, actor, {
          action: "student.updated",
          entityType: "Student",
          entityId: data.id,
          metadata: { fullName: data.fullName, changes }
        });
      }
      // Xóa trống năm sinh thì đoán lại theo lớp đang học.
      if (data.birthYear === null) await fillMissingBirthYears(tx, [data.id]);
      // Trang lớp hiển thị tên/SĐT/memo theo bản chụp trên hóa đơn, nên phải đồng bộ hóa đơn chưa đóng.
      return syncUnpaidInvoicesWithStudent(tx, { id: data.id, fullName: data.fullName, phone: data.phone }, actor);
    });
  } catch (updateError) {
    return actionFailure(updateError, "Không thể lưu thông tin học sinh.");
  }
  return successState(
    changedMemos.length > 0
      ? `Đã lưu thông tin ${data.fullName}. Memo đã đổi: ${changedMemos.map((item) => `${item.from} → ${item.to}`).join("; ")}. Nhớ báo phụ huynh memo mới.`
      : `Đã lưu thông tin ${data.fullName}.`
  );
}

// Quản lý phụ cũng được thêm/sửa/lưu trữ hồ sơ học sinh (không đụng tới lớp hay hóa đơn).
async function changeStudentArchive(formData: FormData, mode: "archive" | "restore"): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "student", mode, id, reason, actor });
  } catch (archiveError) {
    return actionFailure(archiveError, mode === "archive" ? "Không thể lưu trữ học sinh." : "Không thể khôi phục học sinh.");
  }
  return successState(mode === "archive" ? "Đã lưu trữ hồ sơ học sinh." : "Đã khôi phục hồ sơ học sinh.");
}

export async function archiveStudentAction(formData: FormData) {
  return changeStudentArchive(formData, "archive");
}

export async function restoreStudentAction(formData: FormData) {
  return changeStudentArchive(formData, "restore");
}
