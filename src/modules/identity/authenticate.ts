import { hashPassword, prisma, verifyPassword } from "@/modules/core";
import { normalizeStudentCode } from "./credentials";
import { isLocked, lockAfterFailure } from "./lockout";
import type { PortalSession } from "./portal-token";

export type AuthResult =
  | { ok: true; sub: string; ver: number }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "locked"; lockedUntil: Date };

type Credential = { id: string; secretHash: string; sessionVersion: number; lockedUntil: Date | null; usable: boolean };
type CounterStore = {
  recordFailure(id: string): Promise<number>;
  lock(id: string, data: { failedLogins: number; lockedUntil: Date }): Promise<unknown>;
  reset(id: string): Promise<unknown>;
};

// Băm giả để tài khoản không tồn tại tốn cùng thời gian kiểm như tài khoản có thật.
let dummyHash: string | null = null;

/**
 * Luồng chung cho giáo viên và học sinh: tài khoản đang khoá thì từ chối kể cả đúng mật khẩu;
 * sai thì cộng dồn trong DB và khoá khi đủ ngưỡng; đúng thì xoá bộ đếm. Tài khoản không tồn tại
 * hoặc bị vô hiệu hoá trả cùng một lỗi "invalid".
 */
async function authenticate(credential: Credential | null, secret: string, store: CounterStore, now: Date): Promise<AuthResult> {
  if (!credential) {
    verifyPassword(secret, (dummyHash ??= hashPassword("not-a-real-account")));
    return { ok: false, reason: "invalid" };
  }
  if (isLocked(credential.lockedUntil, now)) {
    return { ok: false, reason: "locked", lockedUntil: credential.lockedUntil! };
  }
  const valid = verifyPassword(secret, credential.secretHash);
  if (!credential.usable) return { ok: false, reason: "invalid" };
  if (!valid) {
    const failedLogins = await store.recordFailure(credential.id);
    const lock = lockAfterFailure(failedLogins, now);
    if (lock) {
      await store.lock(credential.id, lock);
      return { ok: false, reason: "locked", lockedUntil: lock.lockedUntil };
    }
    return { ok: false, reason: "invalid" };
  }
  await store.reset(credential.id);
  return { ok: true, sub: credential.id, ver: credential.sessionVersion };
}

const teacherCounters: CounterStore = {
  recordFailure: async (id) =>
    (await prisma.teacher.update({ where: { id }, data: { failedLogins: { increment: 1 } }, select: { failedLogins: true } }))
      .failedLogins,
  lock: (id, data) => prisma.teacher.update({ where: { id }, data }),
  reset: (id) => prisma.teacher.update({ where: { id }, data: { failedLogins: 0, lockedUntil: null } })
};

const studentCounters: CounterStore = {
  recordFailure: async (studentId) =>
    (
      await prisma.studentAccount.update({
        where: { studentId },
        data: { failedLogins: { increment: 1 } },
        select: { failedLogins: true }
      })
    ).failedLogins,
  lock: (studentId, data) => prisma.studentAccount.update({ where: { studentId }, data }),
  reset: (studentId) => prisma.studentAccount.update({ where: { studentId }, data: { failedLogins: 0, lockedUntil: null } })
};

export async function authenticateTeacher(username: string, password: string, now = new Date()) {
  const teacher = await prisma.teacher.findUnique({ where: { username: username.trim().toLowerCase() } });
  return authenticate(
    teacher && {
      id: teacher.id,
      secretHash: teacher.passwordHash,
      sessionVersion: teacher.sessionVersion,
      lockedUntil: teacher.lockedUntil,
      usable: teacher.disabledAt === null
    },
    password,
    teacherCounters,
    now
  );
}

export async function authenticateStudent(codeInput: string, pin: string, now = new Date()) {
  const code = normalizeStudentCode(codeInput);
  const account = code
    ? await prisma.studentAccount.findUnique({ where: { code }, include: { student: { select: { archivedAt: true } } } })
    : null;
  return authenticate(
    account && {
      id: account.studentId,
      secretHash: account.pinHash,
      sessionVersion: account.sessionVersion,
      lockedUntil: account.lockedUntil,
      usable: account.student.archivedAt === null
    },
    pin,
    studentCounters,
    now
  );
}

export type CurrentTeacher = { id: string; username: string; fullName: string };
export type CurrentStudent = { id: string; fullName: string; code: string };

/** Phiên còn hiệu lực khi tài khoản còn dùng được và chưa bị đặt lại/khoá sau lúc đăng nhập. */
export async function resolveTeacherSession(session: PortalSession | null): Promise<CurrentTeacher | null> {
  if (!session) return null;
  const teacher = await prisma.teacher.findUnique({
    where: { id: session.sub },
    select: { id: true, username: true, fullName: true, sessionVersion: true, disabledAt: true }
  });
  if (!teacher || teacher.disabledAt || teacher.sessionVersion !== session.ver) return null;
  return { id: teacher.id, username: teacher.username, fullName: teacher.fullName };
}

export async function resolveStudentSession(session: PortalSession | null): Promise<CurrentStudent | null> {
  if (!session) return null;
  const account = await prisma.studentAccount.findUnique({
    where: { studentId: session.sub },
    select: { code: true, sessionVersion: true, student: { select: { id: true, fullName: true, archivedAt: true } } }
  });
  if (!account || account.student.archivedAt || account.sessionVersion !== session.ver) return null;
  return { id: account.student.id, fullName: account.student.fullName, code: account.code };
}
