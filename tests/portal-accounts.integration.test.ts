import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, test } from "node:test";

import { hashPassword, verifyPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import { listClassesForTeacher, listCurrentStudentsInClass } from "../src/modules/center/portal-classes";
import { assignClassesByTeacherName, setTeacherClasses } from "../src/modules/center/teacher-classes";
import { authenticateStudent, authenticateTeacher } from "../src/modules/identity/authenticate";
import {
  changeTeacherPassword,
  createTeacherAccount,
  IdentityError,
  issueStudentAccounts,
  listTeacherAccounts,
  resetStudentPin,
  resetTeacherPassword,
  setTeacherDisabled,
  unlockStudent
} from "../src/modules/identity/manage";
import { assertSafeLedgerIntegrationDatabase } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const ns = randomUUID().replace(/-/g, "").slice(0, 8);
const created = { teacherIds: [] as string[], studentIds: [] as string[], classIds: [] as string[] };
let seq = 0;

async function teacher(fullName = "Cô Trang") {
  const t = await createTeacherAccount({ username: `gv-${ns}-${seq++}`, fullName, password: "mat-khau-gv-1" });
  created.teacherIds.push(t.id);
  return t;
}

async function classRoom(teacherName: string, extra: { archived?: boolean; teacherId?: string } = {}) {
  const c = await prisma.classRoom.create({
    data: {
      name: `Lớp ${ns} ${seq}`,
      shortCode: `PA${ns}${seq++}`.toUpperCase(),
      teacherToken: randomUUID().replace(/-/g, ""),
      teacherName,
      teacherId: extra.teacherId ?? null,
      pricePerSession: 100000,
      sessionsPerMonthDefault: 8,
      archivedAt: extra.archived ? new Date() : null
    }
  });
  created.classIds.push(c.id);
  return c;
}

async function student(fullName: string, extra: { archived?: boolean } = {}) {
  const s = await prisma.student.create({
    data: { fullName: `${fullName} ${ns}`, phone: "0900000000", address: "", archivedAt: extra.archived ? new Date() : null }
  });
  created.studentIds.push(s.id);
  return s;
}

after(async () => {
  await prisma.enrollment.deleteMany({ where: { classId: { in: created.classIds } } });
  await prisma.classRoom.deleteMany({ where: { id: { in: created.classIds } } });
  await prisma.student.deleteMany({ where: { id: { in: created.studentIds } } });
  await prisma.teacher.deleteMany({ where: { id: { in: created.teacherIds } } });
  await prisma.$disconnect();
});

describe("teacher accounts", () => {
  test("duplicate username is a readable error", async () => {
    const t = await teacher();
    await assert.rejects(
      createTeacherAccount({ username: t.username, fullName: "Ai đó", password: "mat-khau-gv-1" }),
      (error) => error instanceof IdentityError && /đã được dùng/.test(error.message)
    );
  });

  test("auto-assigns unassigned, non-archived classes whose teacher name matches loosely", async () => {
    const other = await teacher("Thầy Minh");
    const match1 = await classRoom(`Cô  Hạnh ${ns}`);
    const match2 = await classRoom(` cô hạnh ${ns.toUpperCase()} `);
    const archived = await classRoom(`Cô Hạnh ${ns}`, { archived: true });
    const takenByOther = await classRoom(`Cô Hạnh ${ns}`, { teacherId: other.id });
    const different = await classRoom(`Cô Hà ${ns}`);

    const t = await teacher(`Cô Hạnh ${ns}`);
    const assigned = await assignClassesByTeacherName(t.id, t.fullName);
    assert.deepEqual(assigned.sort(), [match1.id, match2.id].sort());

    const rows = await prisma.classRoom.findMany({
      where: { id: { in: [archived.id, takenByOther.id, different.id] } },
      select: { id: true, teacherId: true }
    });
    assert.deepEqual(
      Object.fromEntries(rows.map((r) => [r.id, r.teacherId])),
      { [archived.id]: null, [takenByOther.id]: other.id, [different.id]: null }
    );
  });

  test("setting classes moves them from another teacher and unassigns the rest", async () => {
    const a = await teacher();
    const b = await teacher();
    const keep = await classRoom("x", { teacherId: a.id });
    const drop = await classRoom("x", { teacherId: a.id });
    const steal = await classRoom("x", { teacherId: b.id });

    await setTeacherClasses(a.id, [keep.id, steal.id]);
    const byId = Object.fromEntries(
      (await prisma.classRoom.findMany({ where: { id: { in: [keep.id, drop.id, steal.id] } } })).map((c) => [c.id, c.teacherId])
    );
    assert.deepEqual(byId, { [keep.id]: a.id, [drop.id]: null, [steal.id]: a.id });

    const listed = (await listTeacherAccounts()).find((t) => t.id === a.id);
    assert.deepEqual(listed?.classes.map((c) => c.id).sort(), [keep.id, steal.id].sort());
  });

  test("password reset unlocks and logs out; disabling blocks login", async () => {
    const t = await teacher();
    await prisma.teacher.update({ where: { id: t.id }, data: { lockedUntil: new Date(Date.now() + 600_000), failedLogins: 3 } });

    await resetTeacherPassword(t.id, "mat-khau-moi-2");
    const row = await prisma.teacher.findUniqueOrThrow({ where: { id: t.id } });
    assert.equal(row.sessionVersion, 1);
    assert.equal(row.lockedUntil, null);
    assert.equal((await authenticateTeacher(t.username, "mat-khau-moi-2")).ok, true);

    await setTeacherDisabled(t.id, true);
    assert.equal((await authenticateTeacher(t.username, "mat-khau-moi-2")).ok, false);
    assert.equal((await prisma.teacher.findUniqueOrThrow({ where: { id: t.id } })).sessionVersion, 2);
    await setTeacherDisabled(t.id, false);
    assert.equal((await authenticateTeacher(t.username, "mat-khau-moi-2")).ok, true);

    await assert.rejects(resetTeacherPassword("khong-co", "mat-khau-moi-2"), IdentityError);
  });
});

describe("teacher self-service", () => {
  test("changing the password needs the current one and bumps the session version", async () => {
    const t = await teacher();
    await assert.rejects(changeTeacherPassword(t.id, "sai-mat-khau", "mat-khau-moi-3"), IdentityError);
    assert.equal(await changeTeacherPassword(t.id, "mat-khau-gv-1", "mat-khau-moi-3"), 1);
    assert.equal((await authenticateTeacher(t.username, "mat-khau-gv-1")).ok, false);
    assert.deepEqual(await authenticateTeacher(t.username, "mat-khau-moi-3"), { ok: true, sub: t.id, ver: 1 });
  });

  test("class list carries the current student count", async () => {
    const t = await teacher();
    const c = await classRoom("x", { teacherId: t.id });
    const [a, b, gone] = [await student("Đếm A"), await student("Đếm B"), await student("Đếm C", { archived: true })];
    await prisma.enrollment.createMany({
      data: [
        { studentId: a.id, classId: c.id },
        { studentId: b.id, classId: c.id, leftAt: new Date(Date.now() - 86_400_000) },
        { studentId: gone.id, classId: c.id }
      ]
    });
    const [row] = await listClassesForTeacher(t.id);
    assert.equal(row.id, c.id);
    assert.equal(row.studentCount, 1);
    assert.equal(row.teacherToken, c.teacherToken);
  });
});

describe("student accounts", () => {
  test("class roster excludes students who left and archived students, sorted by name", async () => {
    const c = await classRoom("x");
    const [binh, an, left, archived] = [await student("Bình"), await student("An"), await student("Cường"), await student("Dũng", { archived: true })];
    await prisma.enrollment.createMany({
      data: [
        { studentId: binh.id, classId: c.id, status: "on_leave" },
        { studentId: an.id, classId: c.id },
        { studentId: left.id, classId: c.id, leftAt: new Date(Date.now() - 86_400_000) },
        { studentId: archived.id, classId: c.id }
      ]
    });
    assert.deepEqual(await listCurrentStudentsInClass(c.id), [
      { id: an.id, fullName: an.fullName, onLeave: false },
      { id: binh.id, fullName: binh.fullName, onLeave: true }
    ]);
  });

  test("issuing 'missing' creates once; 'all' renews PINs and keeps codes", async () => {
    const s1 = await student("Hà");
    const s2 = await student("Lan");
    const oldCode = `K7${ns.replace(/[^a-z]/gi, "x").slice(0, 4)}`.toUpperCase();
    await prisma.studentAccount.create({ data: { studentId: s2.id, code: oldCode, codeKey: oldCode.toLowerCase(), pinHash: hashPassword("048213") } });

    const first = await issueStudentAccounts([s1.id, s2.id], "missing");
    assert.deepEqual(first.map((i) => i.studentId), [s1.id]);
    assert.match(first[0].pin, /^\d{6}$/);
    assert.equal((await authenticateStudent(first[0].code, first[0].pin)).ok, true);
    assert.deepEqual(await issueStudentAccounts([s1.id, s2.id], "missing"), []);

    const before = await prisma.studentAccount.findUniqueOrThrow({ where: { studentId: s2.id } });
    const all = await issueStudentAccounts([s1.id, s2.id], "all");
    assert.deepEqual(all.map((i) => i.studentId), [s1.id, s2.id]);
    const renewed = all.find((i) => i.studentId === s2.id)!;
    assert.equal(renewed.code, before.code);
    const renewedRow = await prisma.studentAccount.findUniqueOrThrow({ where: { studentId: s2.id } });
    assert.equal(renewedRow.sessionVersion, before.sessionVersion + 1);
    assert.equal(verifyPassword("048213", renewedRow.pinHash), false);
    assert.equal(verifyPassword(renewed.pin, renewedRow.pinHash), true);
  });

  test("codes follow the name and count up for namesakes, even when issued at the same time", async () => {
    const [a, b, c] = [await student("Nguyễn Văn Hương"), await student("Nguyễn Văn Hương"), await student("Nguyễn Văn Hương")];
    // Họ tên trong test có thêm ns ở cuối nên phần chữ của mã lấy theo ns; chỉ cần ba em chung phần chữ.
    const base = (await issueStudentAccounts([a.id], "missing"))[0].code.replace(/\d+$/, "");
    const parallel = await Promise.all([issueStudentAccounts([b.id], "missing"), issueStudentAccounts([c.id], "missing")]);
    const codes = [`${base}01`, ...parallel.map(([issued]) => issued.code)].sort();
    assert.deepEqual(codes, [`${base}01`, `${base}02`, `${base}03`]);
    const [issuedB] = parallel[0];
    assert.equal((await authenticateStudent(issuedB.code.toLowerCase(), issuedB.pin)).ok, true, "gõ chữ thường vẫn vào được");
  });

  test("PIN reset unlocks and logs out; unlock clears the counter; missing account is an error", async () => {
    const s = await student("Khoa");
    const [issued] = await issueStudentAccounts([s.id], "missing");
    await prisma.studentAccount.update({
      where: { studentId: s.id },
      data: { lockedUntil: new Date(Date.now() + 600_000), failedLogins: 0 }
    });
    const renewed = await resetStudentPin(s.id);
    assert.equal(renewed.code, issued.code);
    assert.equal((await authenticateStudent(renewed.code, issued.pin)).ok, false);
    assert.equal((await authenticateStudent(renewed.code, renewed.pin)).ok, true);

    await prisma.studentAccount.update({ where: { studentId: s.id }, data: { lockedUntil: new Date(Date.now() + 600_000), failedLogins: 2 } });
    await unlockStudent(s.id);
    const row = await prisma.studentAccount.findUniqueOrThrow({ where: { studentId: s.id } });
    assert.equal(row.lockedUntil, null);
    assert.equal(row.failedLogins, 0);

    const noAccount = await student("Chưa có");
    await assert.rejects(resetStudentPin(noAccount.id), IdentityError);
    await assert.rejects(unlockStudent(noAccount.id), IdentityError);
  });
});
