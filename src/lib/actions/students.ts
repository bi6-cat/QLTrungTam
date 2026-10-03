"use server";

import { revalidatePath } from "next/cache";
import { errorState, successState, type CreateStudentState, type ResultState } from "@/lib/action-states";
import { actionFailure, revalidateRosterPaths } from "@/lib/actions/shared";
import { changeArchiveState, parseArchiveInput } from "@/lib/archive";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createStudentSchema, safeParseForm, updateStudentSchema } from "@/lib/validation";

/**
 * Thêm học sinh thủ công, chặn trùng hồ sơ.
 *
 * - Trùng cả tên lẫn SĐT  -> chặn hẳn (gần như chắc chắn là nhập lặp).
 * - Trùng ở hồ sơ đã lưu trữ -> chặn, hướng dẫn khôi phục thay vì tạo bản sao.
 * - Chỉ trùng SĐT (khác tên) -> vẫn tạo, kèm cảnh báo vì anh chị em dùng chung
 *   số phụ huynh là bình thường, nhưng cùng lớp thì memo sẽ đụng nhau.
 */
export async function createStudentAction(
  _prevState: CreateStudentState,
  formData: FormData
): Promise<CreateStudentState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createStudentSchema, formData);
  if (error || !data) {
    return { warning: "", success: "", error: error ?? "Dữ liệu không hợp lệ." };
  }

  const samePhone = await prisma.student.findMany({
    where: { phone: data.phone },
    select: { id: true, fullName: true, archivedAt: true },
    take: 20
  });

  const normalized = data.fullName.toLocaleLowerCase("vi");
  const duplicate = samePhone.find((student) => student.fullName.toLocaleLowerCase("vi") === normalized);
  if (duplicate) {
    return {
      warning: "",
      success: "",
      error: duplicate.archivedAt
        ? `"${duplicate.fullName}" (${data.phone}) đã có trong hồ sơ lưu trữ. Hãy khôi phục hồ sơ đó thay vì tạo mới.`
        : `"${duplicate.fullName}" (${data.phone}) đã tồn tại. Không tạo thêm hồ sơ trùng.`
    };
  }

  const created = await prisma.student.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    },
    select: { fullName: true }
  });

  const activeSiblings = samePhone.filter((student) => !student.archivedAt);
  revalidatePath("/admin/students");
  return {
    error: "",
    success: `Đã thêm học sinh ${created.fullName}.`,
    warning:
      activeSiblings.length > 0
        ? `SĐT ${data.phone} đang dùng cho ${activeSiblings
            .map((student) => student.fullName)
            .join(", ")}. Nếu là anh chị em thì bình thường, nhưng tránh xếp chung một lớp vì nội dung chuyển khoản sẽ trùng nhau.`
        : ""
  };
}

export async function updateStudentAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateStudentSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const updated = await prisma.student.updateMany({
    where: { id: data.id, archivedAt: null },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    }
  });
  if (updated.count !== 1) {
    return errorState("Học sinh đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục hồ sơ trước khi sửa.");
  }
  revalidatePath("/admin/students", "layout");
  revalidatePath("/admin/classes");
  return successState(`Đã lưu thông tin ${data.fullName}.`);
}

async function changeStudentArchive(formData: FormData, mode: "archive" | "restore"): Promise<ResultState> {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "student", mode, id, reason, actor });
  } catch (archiveError) {
    return actionFailure(archiveError, mode === "archive" ? "Không thể lưu trữ học sinh." : "Không thể khôi phục học sinh.");
  }
  revalidateRosterPaths();
  return successState(mode === "archive" ? "Đã lưu trữ hồ sơ học sinh." : "Đã khôi phục hồ sơ học sinh.");
}

export async function archiveStudentAction(formData: FormData) {
  return changeStudentArchive(formData, "archive");
}

export async function restoreStudentAction(formData: FormData) {
  return changeStudentArchive(formData, "restore");
}

// Import Excel lưu qua API route (payload lớn); sau đó client gọi action này thay cho
// router.refresh() để nhận dữ liệu mới trong response của action.
export async function refreshAfterStudentImportAction() {
  await requireAdmin();
  revalidateRosterPaths();
}
