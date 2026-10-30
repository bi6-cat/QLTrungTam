import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";

import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { listClassesForStudent, listClassesForTeacher } from "../src/modules/center";
import {
  authenticateStudent,
  authenticateTeacher,
  resolveStudentSession,
  resolveTeacherSession
} from "../src/modules/identity/authenticate";
import { MAX_FAILED_LOGINS, STUDENT_MAX_FAILED_LOGINS } from "../src/modules/identity/lockout";
import { assertSafeLedgerIntegrationDatabase } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const ns = randomUUID().slice(0, 8);
const created = { teacherIds: [] as string[], studentIds: [] as string[], classIds: [] as string[] };
const later = (from: Date, minutes: number) => new Date(from.getTime() + minutes * 60_000);

async function createTeacher(password = "mat-khau-gv-1", extra: { disabledAt?: Date } = {}) {
  const teacher = await prisma.teacher.create({
    data: { username: `gv-${ns}-${created.teacherIds.length}`, passwordHash: hashPassword(password), fullName: "Cô Trang", ...extra }
  });
  created.teacherIds.push(teacher.id);
  return teacher;
}

let codeSeq = 0;
async function createStudentAccount(pin = "048213", extra: { archived?: boolean } = {}) {
  const student = await prisma.student.create({
    data: { fullName: `HS ${ns}`, phone: "0900000000", address: "", archivedAt: extra.archived ? new Date() : null }
  });
  created.studentIds.push(student.id);
  // Mã thử nghiệm riêng mỗi lượt chạy, dạng mã thật: chữ (từ ns) + số đếm.
  const code = `Hs${ns.replace(/[^a-z]/gi, "x").slice(0, 6)}${String(codeSeq++).padStart(2, "0")}`;
  const account = await prisma.studentAccount.create({
    data: { studentId: student.id, code, codeKey: code.toLowerCase(), pinHash: hashPassword(pin) }
  });
  return { student, account };
}

after(async () => {
  await prisma.enrollment.deleteMany({ where: { classId: { in: created.classIds } } });
  await prisma.classRoom.deleteMany({ where: { id: { in: created.classIds } } });
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
  await prisma.teacher.deleteMany({ where: { id: { in: created.teacherIds } } });
  await prisma.$disconnect();
});

describe("teacher login", () => {
  test("accepts the right password, case-insensitive username", async () => {
    const teacher = await createTeacher();
    const result = await authenticateTeacher(` ${teacher.username.toUpperCase()} `, "mat-khau-gv-1");
    assert.deepEqual(result, { ok: true, sub: teacher.id, ver: 0 });
  });

  test("unknown user, wrong password and disabled account give the same error", async () => {
    const teacher = await createTeacher();
    const disabled = await createTeacher("mat-khau-gv-1", { disabledAt: new Date() });
    assert.deepEqual(await authenticateTeacher(`khong-co-${ns}`, "x"), { ok: false, reason: "invalid" });
    assert.deepEqual(await authenticateTeacher(teacher.username, "sai"), { ok: false, reason: "invalid" });
    assert.deepEqual(await authenticateTeacher(disabled.username, "mat-khau-gv-1"), { ok: false, reason: "invalid" });
  });

  test(`locks after ${MAX_FAILED_LOGINS} wrong passwords, even for the right password, until the lock expires`, async () => {
    const teacher = await createTeacher();
    const now = new Date();
    for (let i = 1; i < MAX_FAILED_LOGINS; i++) {
      assert.equal((await authenticateTeacher(teacher.username, "sai", now)).ok, false);
    }
    const locked = await authenticateTeacher(teacher.username, "sai", now);
    assert.equal(locked.ok === false && locked.reason, "locked");
    const stillLocked = await authenticateTeacher(teacher.username, "mat-khau-gv-1", later(now, 5));
    assert.equal(stillLocked.ok === false && stillLocked.reason, "locked");

    const afterLock = await authenticateTeacher(teacher.username, "mat-khau-gv-1", later(now, 16));
    assert.equal(afterLock.ok, true);
    const row = await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } });
    assert.equal(row.failedLogins, 0);
    assert.equal(row.lockedUntil, null);
  });

  test("a successful login clears earlier failures", async () => {
    const teacher = await createTeacher();
    await authenticateTeacher(teacher.username, "sai");
    await authenticateTeacher(teacher.username, "sai");
    await authenticateTeacher(teacher.username, "mat-khau-gv-1");
    assert.equal((await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id } })).failedLogins, 0);
  });
});

describe("student login", () => {
  test("accepts the code as typed (any case, spaces) with the right PIN", async () => {
    const { student, account } = await createStudentAccount();
    const typed = ` ${account.code.slice(0, 3).toUpperCase()} ${account.code.slice(3).toLowerCase()} `;
    assert.deepEqual(await authenticateStudent(typed, "048213"), { ok: true, sub: student.id, ver: 0 });
  });

  test("wrong PIN, malformed code and archived student are rejected", async () => {
    const { account } = await createStudentAccount();
    const archived = await createStudentAccount("048213", { archived: true });
    assert.deepEqual(await authenticateStudent(account.code, "111222"), { ok: false, reason: "invalid" });
    assert.deepEqual(await authenticateStudent("not-a-code", "048213"), { ok: false, reason: "invalid" });
    assert.deepEqual(await authenticateStudent(archived.account.code, "048213"), { ok: false, reason: "invalid" });
  });

  test(`a whole student account locks only after ${STUDENT_MAX_FAILED_LOGINS} wrong PINs (guessable codes)`, async () => {
    const { account } = await createStudentAccount();
    const now = new Date();
    for (let i = 1; i < STUDENT_MAX_FAILED_LOGINS; i++) {
      assert.deepEqual(await authenticateStudent(account.code, "999111", now), { ok: false, reason: "invalid" });
    }
    const locked = await authenticateStudent(account.code, "999111", now);
    assert.equal(locked.ok === false && locked.reason, "locked");
    const stillLocked = await authenticateStudent(account.code, "048213", later(now, 1));
    assert.equal(stillLocked.ok === false && stillLocked.reason, "locked");
    assert.equal((await authenticateStudent(account.code, "048213", later(now, 16))).ok, true);
  });

  test("parallel wrong PINs are all counted", async () => {
    const { account } = await createStudentAccount();
    await Promise.all([1, 2, 3].map(() => authenticateStudent(account.code, "999111")));
    const row = await prisma.studentAccount.findUniqueOrThrow({ where: { studentId: account.studentId } });
    assert.equal(row.failedLogins, 3);
  });
});

describe("session check", () => {
  test("a teacher session dies when the session version changes or the account is disabled", async () => {
    const teacher = await createTeacher();
    const session = { sub: teacher.id, ver: 0, exp: Date.now() + 60_000 };
    assert.equal((await resolveTeacherSession(session))?.id, teacher.id);

    await prisma.teacher.update({ where: { id: teacher.id }, data: { sessionVersion: { increment: 1 } } });
    assert.equal(await resolveTeacherSession(session), null);
    assert.equal((await resolveTeacherSession({ ...session, ver: 1 }))?.id, teacher.id);

    await prisma.teacher.update({ where: { id: teacher.id }, data: { disabledAt: new Date() } });
    assert.equal(await resolveTeacherSession({ ...session, ver: 1 }), null);
  });

  test("a student session dies when the PIN is reset or the student is archived", async () => {
    const { student } = await createStudentAccount();
    const session = { sub: student.id, ver: 0, exp: Date.now() + 60_000 };
    assert.equal((await resolveStudentSession(session))?.fullName, student.fullName);

    await prisma.studentAccount.update({ where: { studentId: student.id }, data: { sessionVersion: 1 } });
    assert.equal(await resolveStudentSession(session), null);

    await prisma.student.update({ where: { id: student.id }, data: { archivedAt: new Date() } });
    assert.equal(await resolveStudentSession({ ...session, ver: 1 }), null);
  });
});

describe("portal class lists", () => {
  test("teacher sees assigned, non-archived classes; student sees classes not yet left", async () => {
    const teacher = await createTeacher();
    const mk = async (suffix: string, archived = false) => {
      const c = await prisma.classRoom.create({
        data: {
          name: `Lớp ${suffix} ${ns}`,
          shortCode: `T${ns.slice(0, 5)}${suffix}`.toUpperCase().replace(/[^A-Z0-9]/g, "X"),
          teacherToken: randomUUID(),
          teacherName: "Cô Trang",
          teacherId: teacher.id,
          pricePerSession: 100000,
          sessionsPerMonthDefault: 8,
          archivedAt: archived ? new Date() : null
        }
      });
      created.classIds.push(c.id);
      return c;
    };
    const current = await mk("A");
    const archived = await mk("B", true);
    const left = await mk("C");

    assert.deepEqual((await listClassesForTeacher(teacher.id)).map((c) => c.id).sort(), [current.id, left.id].sort());

    const { student } = await createStudentAccount();
    await prisma.enrollment.createMany({
      data: [
        { studentId: student.id, classId: current.id, status: "on_leave" },
        { studentId: student.id, classId: archived.id },
        { studentId: student.id, classId: left.id, leftAt: new Date(Date.now() - 86_400_000) }
      ]
    });
    assert.deepEqual(await listClassesForStudent(student.id), [
      { id: current.id, name: current.name, shortCode: current.shortCode, teacherName: "Cô Trang", onLeave: true }
    ]);
  });
});
