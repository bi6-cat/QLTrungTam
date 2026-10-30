"use server";

import type { Prisma } from "@prisma/client";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireAdmin, type StaffUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createTeacherSchema,
  idSchema,
  resetTeacherPasswordSchema,
  safeParseForm,
  teacherClassesSchema,
  teacherIdSchema
} from "@/lib/validation";
import { assignClassesByTeacherName, setTeacherClasses } from "@/modules/center";
import {
  createTeacherAccount,
  IdentityError,
  resetStudentPin,
  resetTeacherPassword,
  setTeacherDisabled,
  setTeacherVocabEnabled,
  unlockStudent,
  unlockTeacher
} from "@/modules/identity";

// Chỉ chủ trung tâm quản lý tài khoản giáo viên và học sinh của cổng học tập.

async function audit(actor: StaffUser, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonObject) {
  await prisma.auditLog.create({
    data: { actorUserId: actor.userId, actorUsername: actor.username.trim(), action, entityType, entityId, metadata }
  });
}

function failure(error: unknown, fallback: string): ResultState {
  if (error instanceof IdentityError) return errorState(error.message);
  console.error(fallback, error);
  return errorState(`${fallback} Vui lòng tải lại trang và thử lại.`);
}

export async function createTeacherAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(createTeacherSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    // Admin và giáo viên đăng nhập chung một form: tên đăng nhập không được trùng giữa hai loại.
    if (await prisma.adminUser.count({ where: { username: { equals: data.username, mode: "insensitive" } } })) {
      return errorState(`Tên đăng nhập "${data.username}" đã được dùng.`);
    }
    const teacher = await createTeacherAccount(data);
    const assigned = await assignClassesByTeacherName(teacher.id, teacher.fullName);
    await audit(actor, "teacher.created", "Teacher", teacher.id, {
      username: teacher.username,
      vocabEnabled: data.vocabEnabled,
      autoAssignedClassIds: assigned
    });
    return successState(
      assigned.length > 0
        ? `Đã tạo tài khoản "${teacher.username}" và gán ${assigned.length} lớp có giáo viên "${teacher.fullName}".`
        : `Đã tạo tài khoản "${teacher.username}". Chưa có lớp nào ghi giáo viên "${teacher.fullName}", hãy gán lớp thủ công.`
    );
  } catch (createError) {
    return failure(createError, "Không tạo được tài khoản giáo viên.");
  }
}

export async function setTeacherClassesAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = teacherClassesSchema.safeParse({
    teacherId: formData.get("teacherId"),
    classIds: formData.getAll("classId")
  });
  if (!parsed.success) return errorState("Dữ liệu không hợp lệ.");

  try {
    const exists = await prisma.teacher.count({ where: { id: parsed.data.teacherId } });
    if (!exists) return errorState("Không tìm thấy tài khoản giáo viên.");
    const result = await setTeacherClasses(parsed.data.teacherId, parsed.data.classIds);
    await audit(actor, "teacher.classes_set", "Teacher", parsed.data.teacherId, { classIds: parsed.data.classIds });
    return successState(`Đã lưu: giáo viên dạy ${result.assigned} lớp.`);
  } catch (saveError) {
    return failure(saveError, "Không lưu được danh sách lớp.");
  }
}

export async function resetTeacherPasswordAction(_prev: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(resetTeacherPasswordSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    await resetTeacherPassword(data.teacherId, data.password);
    await audit(actor, "teacher.password_reset", "Teacher", data.teacherId);
    return successState("Đã đặt lại mật khẩu. Giáo viên bị đăng xuất khỏi mọi thiết bị.");
  } catch (resetError) {
    return failure(resetError, "Không đặt lại được mật khẩu.");
  }
}

export async function setTeacherDisabledAction(teacherId: string, disabled: boolean): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = teacherIdSchema.safeParse({ teacherId });
  if (!parsed.success) return errorState("Tài khoản không hợp lệ.");

  try {
    await setTeacherDisabled(parsed.data.teacherId, disabled);
    await audit(actor, disabled ? "teacher.disabled" : "teacher.enabled", "Teacher", parsed.data.teacherId);
    return successState(disabled ? "Đã khoá tài khoản và đăng xuất giáo viên." : "Đã mở lại tài khoản.");
  } catch (toggleError) {
    return failure(toggleError, "Không đổi được trạng thái tài khoản.");
  }
}

export async function setTeacherVocabAction(teacherId: string, enabled: boolean): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = teacherIdSchema.safeParse({ teacherId });
  if (!parsed.success) return errorState("Tài khoản không hợp lệ.");

  try {
    await setTeacherVocabEnabled(parsed.data.teacherId, enabled === true);
    await audit(actor, enabled ? "teacher.vocab_enabled" : "teacher.vocab_disabled", "Teacher", parsed.data.teacherId);
    return successState(
      enabled ? "Đã bật kiểm tra từ vựng." : "Đã tắt kiểm tra từ vựng. Bài đã giao và kết quả vẫn xem được."
    );
  } catch (toggleError) {
    return failure(toggleError, "Không đổi được tính năng từ vựng.");
  }
}

export async function unlockTeacherAction(teacherId: string): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = teacherIdSchema.safeParse({ teacherId });
  if (!parsed.success) return errorState("Tài khoản không hợp lệ.");

  try {
    await unlockTeacher(parsed.data.teacherId);
    await audit(actor, "teacher.unlocked", "Teacher", parsed.data.teacherId);
    return successState("Đã mở khoá đăng nhập.");
  } catch (unlockError) {
    return failure(unlockError, "Không mở khoá được.");
  }
}

export type ResetPinState = ResultState & { code: string; pin: string };

/** PIN mới chỉ hiện một lần trong kết quả này (DB chỉ giữ bản băm). */
export async function resetStudentPinAction(studentId: string): Promise<ResetPinState> {
  const actor = await requireAdmin();
  const parsed = idSchema.safeParse({ id: studentId });
  if (!parsed.success) return { ...errorState("Học sinh không hợp lệ."), code: "", pin: "" };

  try {
    const issued = await resetStudentPin(parsed.data.id);
    await audit(actor, "student_account.pin_reset", "Student", parsed.data.id);
    return { ...successState("Đã cấp PIN mới. Em sẽ bị đăng xuất khỏi thiết bị cũ."), code: issued.code, pin: issued.pin };
  } catch (resetError) {
    return { ...failure(resetError, "Không cấp lại được PIN."), code: "", pin: "" };
  }
}

export async function unlockStudentAction(studentId: string): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = idSchema.safeParse({ id: studentId });
  if (!parsed.success) return errorState("Học sinh không hợp lệ.");

  try {
    await unlockStudent(parsed.data.id);
    await audit(actor, "student_account.unlocked", "Student", parsed.data.id);
    return successState("Đã mở khoá đăng nhập.");
  } catch (unlockError) {
    return failure(unlockError, "Không mở khoá được.");
  }
}
