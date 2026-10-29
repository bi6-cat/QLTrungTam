import { Prisma } from "@prisma/client";
import { hashPassword, prisma, verifyPassword } from "@/modules/core";
import { generatePin, generateStudentCode } from "./credentials";

// Thao tác quản trị tài khoản (admin gọi). Kiểm quyền và ghi audit log do lớp gọi (server action) lo.

export class IdentityError extends Error {}

function isUniqueViolation(error: unknown, field: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(field)
  );
}

// ---------------------------------------------------------------------------
// Giáo viên
// ---------------------------------------------------------------------------

export async function listTeacherAccounts() {
  return prisma.teacher.findMany({
    orderBy: [{ disabledAt: { sort: "asc", nulls: "first" } }, { fullName: "asc" }],
    select: {
      id: true,
      username: true,
      fullName: true,
      lockedUntil: true,
      disabledAt: true,
      createdAt: true,
      classes: { where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true, shortCode: true } }
    }
  });
}

export async function createTeacherAccount(input: { username: string; fullName: string; password: string }) {
  const taken = await prisma.teacher.count({ where: { username: input.username } });
  if (taken) throw new IdentityError(`Tên đăng nhập "${input.username}" đã được dùng.`);
  try {
    return await prisma.teacher.create({
      data: { username: input.username, fullName: input.fullName, passwordHash: hashPassword(input.password) },
      select: { id: true, username: true, fullName: true }
    });
  } catch (error) {
    if (isUniqueViolation(error, "username")) throw new IdentityError(`Tên đăng nhập "${input.username}" đã được dùng.`);
    throw error;
  }
}

async function updateTeacher(teacherId: string, data: Prisma.TeacherUpdateManyMutationInput) {
  const updated = await prisma.teacher.updateMany({ where: { id: teacherId }, data });
  if (updated.count !== 1) throw new IdentityError("Không tìm thấy tài khoản giáo viên.");
}

/** Đặt mật khẩu mới, mở khoá và đăng xuất mọi phiên cũ. */
export function resetTeacherPassword(teacherId: string, password: string) {
  return updateTeacher(teacherId, {
    passwordHash: hashPassword(password),
    failedLogins: 0,
    lockedUntil: null,
    sessionVersion: { increment: 1 }
  });
}

/** Vô hiệu hoá thì đăng xuất ngay; bật lại thì giáo viên đăng nhập lại như thường. */
export function setTeacherDisabled(teacherId: string, disabled: boolean) {
  return updateTeacher(
    teacherId,
    disabled ? { disabledAt: new Date(), sessionVersion: { increment: 1 } } : { disabledAt: null, failedLogins: 0, lockedUntil: null }
  );
}

/**
 * Giáo viên tự đổi mật khẩu. Tăng sessionVersion để đăng xuất các thiết bị khác; trả về số mới để
 * phiên hiện tại cấp lại cookie và ở lại đăng nhập.
 */
export async function changeTeacherPassword(teacherId: string, currentPassword: string, newPassword: string) {
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { passwordHash: true } });
  if (!teacher || !verifyPassword(currentPassword, teacher.passwordHash)) {
    throw new IdentityError("Mật khẩu hiện tại không đúng.");
  }
  const updated = await prisma.teacher.update({
    where: { id: teacherId },
    data: { passwordHash: hashPassword(newPassword), sessionVersion: { increment: 1 } },
    select: { sessionVersion: true }
  });
  return updated.sessionVersion;
}

export function unlockTeacher(teacherId: string) {
  return updateTeacher(teacherId, { failedLogins: 0, lockedUntil: null });
}

// ---------------------------------------------------------------------------
// Học sinh
// ---------------------------------------------------------------------------

export type IssuedCredential = { studentId: string; code: string; pin: string };

export async function getStudentAccounts(studentIds: readonly string[]) {
  const accounts = await prisma.studentAccount.findMany({
    where: { studentId: { in: [...studentIds] } },
    select: { studentId: true, code: true, lockedUntil: true }
  });
  return new Map(accounts.map((a) => [a.studentId, a]));
}

const CODE_ATTEMPTS = 5;

/** Tạo tài khoản với mã mới; mã trùng (rất hiếm) thì sinh mã khác. */
async function createAccount(studentId: string, nextCode: () => string): Promise<IssuedCredential> {
  const pin = generatePin();
  const pinHash = hashPassword(pin);
  for (let attempt = 1; ; attempt++) {
    const code = nextCode();
    // Kiểm trước để mã trùng không thành lỗi Prisma trong log; catch bên dưới chỉ còn cho lúc tranh nhau.
    if (attempt < CODE_ATTEMPTS && (await prisma.studentAccount.count({ where: { code } }))) continue;
    try {
      await prisma.studentAccount.create({ data: { studentId, code, pinHash } });
      return { studentId, code, pin };
    } catch (error) {
      if (isUniqueViolation(error, "code") && attempt < CODE_ATTEMPTS) continue;
      if (isUniqueViolation(error, "studentId")) throw new IdentityError("Học sinh này vừa được cấp tài khoản ở thao tác khác.");
      throw error;
    }
  }
}

/** PIN mới cho tài khoản có sẵn (giữ mã HS), mở khoá và đăng xuất phiên cũ; null nếu chưa có tài khoản. */
async function renewPin(studentId: string): Promise<IssuedCredential | null> {
  const account = await prisma.studentAccount.findUnique({ where: { studentId }, select: { code: true } });
  if (!account) return null;
  const pin = generatePin();
  const updated = await prisma.studentAccount.updateMany({
    where: { studentId },
    data: { pinHash: hashPassword(pin), failedLogins: 0, lockedUntil: null, sessionVersion: { increment: 1 } }
  });
  return updated.count === 1 ? { studentId, code: account.code, pin } : null;
}

/**
 * Cấp tài khoản cho các học sinh: "missing" chỉ tạo cho em chưa có; "all" tạo cho em chưa có và
 * đổi PIN của em đã có. PIN chỉ trả về lúc này (DB chỉ giữ bản băm), nên phải in phiếu ngay.
 */
export async function issueStudentAccounts(
  studentIds: readonly string[],
  mode: "missing" | "all",
  options: { nextCode?: () => string } = {}
) {
  const nextCode = options.nextCode ?? generateStudentCode;
  const existing = await getStudentAccounts(studentIds);
  const issued: IssuedCredential[] = [];
  for (const studentId of studentIds) {
    if (!existing.has(studentId)) issued.push(await createAccount(studentId, nextCode));
    else if (mode === "all") {
      const renewed = await renewPin(studentId);
      if (renewed) issued.push(renewed);
    }
  }
  return issued;
}

export async function resetStudentPin(studentId: string) {
  const renewed = await renewPin(studentId);
  if (!renewed) throw new IdentityError("Học sinh này chưa được cấp tài khoản.");
  return renewed;
}

export async function unlockStudent(studentId: string) {
  const updated = await prisma.studentAccount.updateMany({ where: { studentId }, data: { failedLogins: 0, lockedUntil: null } });
  if (updated.count !== 1) throw new IdentityError("Học sinh này chưa được cấp tài khoản.");
}
