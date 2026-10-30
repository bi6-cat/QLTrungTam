import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, test } from "node:test";

import { hashPassword } from "../src/lib/password";
import { prisma } from "../src/lib/prisma";
import {
  closeAssignment,
  createVocabAssignment,
  getAssignmentResults,
  listAssignmentsForTeacher,
  type VocabAssignmentInput
} from "../src/modules/learning/assignments";
import {
  getAssignmentForStudent,
  getAttemptForStudent,
  listAssignmentsForStudent,
  startAttempt,
  submitAttempt
} from "../src/modules/learning/attempts";
import { LearningError } from "../src/modules/learning/errors";
import {
  createMaterial,
  deleteMaterial,
  getMaterialForTeacher,
  listMaterialsForStudent,
  listMaterialsForTeacher,
  updateMaterial
} from "../src/modules/learning/materials";
import { seededRng } from "../src/modules/learning/random";
import { archiveVocabSet, createVocabSet, getVocabSet, listVocabSets, updateVocabSet } from "../src/modules/learning/vocab/sets";
import { parseWordList } from "../src/modules/learning/vocab/word-list";
import { assertSafeLedgerIntegrationDatabase } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const ns = randomUUID().replace(/-/g, "").slice(0, 8);
const ids = { teachers: [] as string[], students: [] as string[], classes: [] as string[] };
let seq = 0;

const WORDS = parseWordList(
  ["apple - quả táo", "banana - quả chuối", "cat - con mèo", "dog - con chó", "run - chạy", "swim - bơi"].join("\n")
).words;

async function makeTeacher() {
  const t = await prisma.teacher.create({ data: { username: `lt-${ns}-${seq++}`, passwordHash: hashPassword("x"), fullName: "Cô Trang" } });
  ids.teachers.push(t.id);
  return t;
}
async function makeClass(teacherId: string | null) {
  const c = await prisma.classRoom.create({
    data: {
      name: `Anh ${ns} ${seq}`,
      shortCode: `LN${ns}${seq++}`.toUpperCase(),
      teacherToken: randomUUID().replace(/-/g, ""),
      teacherName: "Cô Trang",
      teacherId,
      pricePerSession: 1,
      sessionsPerMonthDefault: 8
    }
  });
  ids.classes.push(c.id);
  return c;
}
async function makeStudent(name: string, classId?: string) {
  const s = await prisma.student.create({ data: { fullName: `${name} ${ns}`, phone: "0", address: "" } });
  ids.students.push(s.id);
  if (classId) await prisma.enrollment.create({ data: { studentId: s.id, classId } });
  return s;
}

let teacher: Awaited<ReturnType<typeof makeTeacher>>;
let otherTeacher: Awaited<ReturnType<typeof makeTeacher>>;
let klass: Awaited<ReturnType<typeof makeClass>>;
let otherClass: Awaited<ReturnType<typeof makeClass>>;
let setId: string;

before(async () => {
  teacher = await makeTeacher();
  otherTeacher = await makeTeacher();
  klass = await makeClass(teacher.id);
  otherClass = await makeClass(otherTeacher.id);
  setId = (await createVocabSet(teacher.id, "Unit 1", WORDS)).id;
});

after(async () => {
  await prisma.assignment.deleteMany({ where: { classId: { in: ids.classes } } });
  await prisma.vocabSet.deleteMany({ where: { teacherId: { in: ids.teachers } } });
  await prisma.enrollment.deleteMany({ where: { classId: { in: ids.classes } } });
  await prisma.classRoom.deleteMany({ where: { id: { in: ids.classes } } });
  await prisma.student.deleteMany({ where: { id: { in: ids.students } } });
  await prisma.teacher.deleteMany({ where: { id: { in: ids.teachers } } });
  await prisma.$disconnect();
});

function quizInput(extra: Partial<VocabAssignmentInput> = {}): VocabAssignmentInput {
  return {
    classId: klass.id,
    setId,
    title: "",
    questionTypes: ["mc_meaning", "type_term"],
    questionCount: 6,
    timeLimitMinutes: null,
    maxAttempts: 1,
    dueAt: null,
    showAnswers: true,
    ...extra
  };
}

/** Đáp án đúng của lượt (đọc thẳng DB, như thể học sinh trả lời đúng hết). */
async function correctAnswers(attemptId: string) {
  const items = await prisma.vocabAttemptItem.findMany({ where: { attemptId } });
  return new Map(items.map((i) => [i.position, i.correctAnswer.split(" / ")[0]]));
}

describe("vocab sets", () => {
  test("belong to their teacher only", async () => {
    assert.equal((await getVocabSet(teacher.id, setId))?.words.length, 6);
    assert.equal(await getVocabSet(otherTeacher.id, setId), null);
    await assert.rejects(updateVocabSet(otherTeacher.id, setId, "x", WORDS), LearningError);
    const listed = await listVocabSets(teacher.id);
    assert.deepEqual(listed.map((s) => [s.title, s.wordCount]), [["Unit 1", 6]]);
  });

  test("editing keeps the ids of words that stay, so old stats still link", async () => {
    const id = (await createVocabSet(teacher.id, "Tạm", parseWordList("one - một\ntwo - hai\nthree - ba").words)).id;
    const before = new Map((await getVocabSet(teacher.id, id))!.words.map((w) => [w.term, w.id]));
    await updateVocabSet(teacher.id, id, "Số đếm", parseWordList("Two - số hai\nfour - bốn\none - một").words);
    const after = (await getVocabSet(teacher.id, id))!;
    assert.equal(after.title, "Số đếm");
    assert.deepEqual(after.words.map((w) => [w.term, w.meaning]), [["Two", "số hai"], ["four", "bốn"], ["one", "một"]]);
    assert.equal(after.words[0].id, before.get("two"));
    assert.equal(after.words[2].id, before.get("one"));
    await archiveVocabSet(teacher.id, id);
    assert.equal(await getVocabSet(teacher.id, id), null);
  });
});

describe("creating an assignment", () => {
  test("only for a class the teacher teaches, with their own set and a valid setup", async () => {
    await assert.rejects(createVocabAssignment(teacher.id, quizInput({ classId: otherClass.id })), /không được gán dạy lớp này/);
    await assert.rejects(createVocabAssignment(otherTeacher.id, quizInput({ classId: otherClass.id })), /Không tìm thấy bộ từ/);
    await assert.rejects(createVocabAssignment(teacher.id, quizInput({ questionCount: 13 })), /tối đa 12 câu/);
    await assert.rejects(createVocabAssignment(teacher.id, quizInput({ maxAttempts: 6 })), /từ 1 đến 5/);
    await assert.rejects(createVocabAssignment(teacher.id, quizInput({ timeLimitMinutes: 0 })), /Thời gian làm bài/);
    await assert.rejects(createVocabAssignment(teacher.id, quizInput({ dueAt: new Date(Date.now() - 1000) })), /Hạn nộp/);

    const { id } = await createVocabAssignment(teacher.id, quizInput({ questionTypes: ["mc_meaning", "bogus", "mc_meaning"] }));
    const quiz = await prisma.vocabQuiz.findUniqueOrThrow({ where: { assignmentId: id } });
    assert.deepEqual(quiz.questionTypes, ["mc_meaning"]);
    assert.equal((await prisma.assignment.findUniqueOrThrow({ where: { id } })).title, "Unit 1");
  });
});

describe("taking an assignment", () => {
  test("only students of the class see it; correct answers stay hidden until submitted", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ title: "Kiểm tra 1" }));
    const student = await makeStudent("An", klass.id);
    const outsider = await makeStudent("Ngoài", otherClass.id);

    assert.ok((await listAssignmentsForStudent(student.id)).some((a) => a.id === id && a.canStart));
    assert.ok(!(await listAssignmentsForStudent(outsider.id)).some((a) => a.id === id));
    assert.equal(await getAssignmentForStudent(outsider.id, id), null);
    await assert.rejects(startAttempt(outsider.id, id), LearningError);

    const { attemptId } = await startAttempt(student.id, id, new Date(), seededRng(7));
    assert.deepEqual(await startAttempt(student.id, id), { attemptId }, "bắt đầu lại thì làm tiếp lượt dở");
    assert.equal(await getAttemptForStudent(outsider.id, attemptId), null);

    const view = (await getAttemptForStudent(student.id, attemptId))!;
    assert.equal(view.items.length, 6);
    assert.ok(view.items.every((i) => i.correctAnswer === null && i.answer === null));
    assert.ok(view.items.filter((i) => i.type === "mc_meaning").every((i) => i.options.length === 4));

    const answers = await correctAnswers(attemptId);
    const wrongPosition = view.items[0].position;
    answers.set(wrongPosition, "sai bét");
    const result = await submitAttempt(student.id, attemptId, answers);
    assert.deepEqual(result, { score: 5, maxScore: 6, alreadySubmitted: false });

    const again = await submitAttempt(student.id, attemptId, await correctAnswers(attemptId));
    assert.deepEqual(again, { score: 5, maxScore: 6, alreadySubmitted: true }, "nộp lại không đổi điểm");

    const reviewed = (await getAttemptForStudent(student.id, attemptId))!;
    assert.ok(reviewed.items.every((i) => i.correctAnswer !== null));
    assert.equal(reviewed.items.find((i) => i.position === wrongPosition)?.isCorrect, false);

    const summary = (await getAssignmentForStudent(student.id, id))!;
    assert.deepEqual([summary.attemptsUsed, summary.bestScore, summary.canStart], [1, 5, false]);
    assert.deepEqual(
      summary.submittedAttempts.map((t) => [t.id, t.attemptNo, t.score, t.late]),
      [[attemptId, 1, 5, false]]
    );
    await assert.rejects(startAttempt(student.id, id), /hết số lượt/);
  });

  test("answers stay hidden after submitting when the teacher turns that off", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ showAnswers: false }));
    const student = await makeStudent("Bình", klass.id);
    const { attemptId } = await startAttempt(student.id, id);
    await submitAttempt(student.id, attemptId, new Map());
    const view = (await getAttemptForStudent(student.id, attemptId))!;
    assert.equal(view.score, 0);
    assert.ok(view.items.every((i) => i.correctAnswer === null && i.isCorrect === null && i.answer === null));
  });

  test("several attempts are numbered and the best score is kept", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ maxAttempts: 2 }));
    const student = await makeStudent("Chi", klass.id);
    const first = await startAttempt(student.id, id);
    await submitAttempt(student.id, first.attemptId, await correctAnswers(first.attemptId));
    const second = await startAttempt(student.id, id);
    assert.notEqual(second.attemptId, first.attemptId);
    await submitAttempt(student.id, second.attemptId, new Map());
    const rows = await prisma.assignmentAttempt.findMany({ where: { assignmentId: id, studentId: student.id }, orderBy: { attemptNo: "asc" } });
    assert.deepEqual(rows.map((r) => [r.attemptNo, r.score]), [[1, 6], [2, 0]]);
    assert.equal((await getAssignmentForStudent(student.id, id))!.bestScore, 6);
  });

  test("double-clicking start or submit does not create two attempts or grade twice", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ maxAttempts: 3 }));
    const student = await makeStudent("Dũng", klass.id);
    const starts = await Promise.all([startAttempt(student.id, id), startAttempt(student.id, id), startAttempt(student.id, id)]);
    assert.equal(new Set(starts.map((s) => s.attemptId)).size, 1);
    assert.equal(await prisma.assignmentAttempt.count({ where: { assignmentId: id, studentId: student.id } }), 1);

    const answers = await correctAnswers(starts[0].attemptId);
    const results = await Promise.all([submitAttempt(student.id, starts[0].attemptId, answers), submitAttempt(student.id, starts[0].attemptId, new Map())]);
    assert.equal(results.filter((r) => !r.alreadySubmitted).length, 1);
    const stored = await prisma.assignmentAttempt.findUniqueOrThrow({ where: { id: starts[0].attemptId } });
    const winner = results.find((r) => !r.alreadySubmitted)!;
    assert.equal(stored.score, winner.score);
    assert.ok(results.every((r) => r.score === winner.score));
  });

  test("submitting past the time limit plus grace is graded but marked late", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ timeLimitMinutes: 1, maxAttempts: 2 }));
    const student = await makeStudent("Em", klass.id);
    const start = new Date();
    const onTime = await startAttempt(student.id, id, start);
    await submitAttempt(student.id, onTime.attemptId, await correctAnswers(onTime.attemptId), new Date(start.getTime() + 115_000));
    const late = await startAttempt(student.id, id, start);
    const lateView = (await getAttemptForStudent(student.id, late.attemptId, new Date(start.getTime() + 61_000)))!;
    assert.equal(lateView.expired, true);
    await submitAttempt(student.id, late.attemptId, await correctAnswers(late.attemptId), new Date(start.getTime() + 125_000));
    const rows = await prisma.assignmentAttempt.findMany({ where: { assignmentId: id }, orderBy: { attemptNo: "asc" } });
    assert.deepEqual(rows.map((r) => [r.score, r.late]), [[6, false], [6, true]]);
  });

  test("a closed assignment cannot be started, but a started attempt can still be submitted", async () => {
    const { id } = await createVocabAssignment(teacher.id, quizInput({ maxAttempts: 2 }));
    const student = await makeStudent("Giang", klass.id);
    const { attemptId } = await startAttempt(student.id, id);
    await assert.rejects(closeAssignment(otherTeacher.id, id), LearningError);
    await closeAssignment(teacher.id, id);
    assert.equal((await submitAttempt(student.id, attemptId, new Map())).alreadySubmitted, false);
    await assert.rejects(startAttempt(student.id, id), /Bài đã đóng/);
    assert.equal((await getAssignmentForStudent(student.id, id))!.state, "closed");
  });
});

describe("teacher results", () => {
  test("show every student, best scores, attempts in progress and the hardest words", async () => {
    const results0 = await createVocabAssignment(teacher.id, quizInput({ questionTypes: ["type_term"], questionCount: 6, maxAttempts: 2 }));
    const id = results0.id;
    const [hoa, khanh, lan] = [await makeStudent("Hoa", klass.id), await makeStudent("Khánh", klass.id), await makeStudent("Lan", klass.id)];

    // Hoa: sai "cat" và "dog" ở lượt 1, đúng hết ở lượt 2. Khánh: sai "cat". Lan: đang làm dở.
    for (const [student, wrongTerms] of [[hoa, ["cat", "dog"]], [khanh, ["cat"]]] as const) {
      const { attemptId } = await startAttempt(student.id, id);
      const answers = await correctAnswers(attemptId);
      for (const [position, term] of answers) if ((wrongTerms as readonly string[]).includes(term)) answers.set(position, "???");
      await submitAttempt(student.id, attemptId, answers);
    }
    const retry = await startAttempt(hoa.id, id);
    await submitAttempt(hoa.id, retry.attemptId, await correctAnswers(retry.attemptId));
    await startAttempt(lan.id, id);

    assert.equal(await getAssignmentResults(otherTeacher.id, id), null);
    const results = (await getAssignmentResults(teacher.id, id))!;
    const row = (sid: string) => results.students.find((s) => s.studentId === sid)!;
    assert.deepEqual([row(hoa.id).submittedAttempts, row(hoa.id).bestScore], [2, 6]);
    assert.deepEqual([row(khanh.id).submittedAttempts, row(khanh.id).bestScore], [1, 5]);
    assert.deepEqual([row(lan.id).submittedAttempts, row(lan.id).inProgress], [0, true]);
    assert.deepEqual(results.hardWords.slice(0, 2), [
      { label: "cat", total: 3, wrong: 2 },
      { label: "dog", total: 3, wrong: 1 }
    ]);

    const listed = (await listAssignmentsForTeacher(teacher.id)).find((a) => a.id === id)!;
    assert.equal(listed.submittedStudents, 2);
    assert.equal(listed.state, "open");
  });

  test("removing a word from the set keeps old attempts and their stats", async () => {
    const id = (await createVocabSet(teacher.id, "Xoá từ", WORDS)).id;
    const { id: assignmentId } = await createVocabAssignment(teacher.id, quizInput({ setId: id, questionTypes: ["type_term"] }));
    const student = await makeStudent("Minh", klass.id);
    const { attemptId } = await startAttempt(student.id, assignmentId);
    await submitAttempt(student.id, attemptId, new Map());

    await updateVocabSet(teacher.id, id, "Xoá từ", WORDS.filter((w) => w.term !== "cat"));
    const items = await prisma.vocabAttemptItem.findMany({ where: { attemptId } });
    assert.equal(items.length, 6);
    assert.equal(items.filter((i) => i.wordId === null).length, 1);
    const results = (await getAssignmentResults(teacher.id, assignmentId))!;
    assert.ok(results.hardWords.some((w) => w.label === "cat"));
    await assert.rejects(startAttempt(student.id, assignmentId), /hết số lượt/);
  });
});

describe("materials", () => {
  test("only the class's teacher posts them and only students of the class see them", async () => {
    const input = { classId: klass.id, title: "Đề cương Unit 1", url: "drive.google.com/x", note: "" };
    await assert.rejects(createMaterial(otherTeacher.id, input), /không được gán dạy lớp này/);
    await assert.rejects(createMaterial(teacher.id, { ...input, url: "javascript:alert(1)" }), LearningError);
    const { id } = await createMaterial(teacher.id, input);

    const student = await makeStudent("Tài liệu", klass.id);
    const outsider = await makeStudent("Ngoài TL", otherClass.id);
    const mine = (await listMaterialsForStudent(student.id)).find((g) => g.classId === klass.id)!;
    assert.deepEqual(mine.materials.map((m) => [m.id, m.url]), [[id, "https://drive.google.com/x"]]);
    assert.ok(!(await listMaterialsForStudent(outsider.id)).some((g) => g.materials.some((m) => m.id === id)));

    assert.equal(await getMaterialForTeacher(otherTeacher.id, id), null);
    await assert.rejects(updateMaterial(otherTeacher.id, id, { ...input, title: "Sửa trộm" }), /Không tìm thấy/);
    await assert.rejects(deleteMaterial(otherTeacher.id, id), /Không tìm thấy/);
    await assert.rejects(updateMaterial(teacher.id, id, { ...input, classId: otherClass.id }), /không được gán dạy lớp này/);

    await updateMaterial(teacher.id, id, { ...input, title: "Đề cương mới", url: "", note: "Ôn trang 5" });
    const edited = (await getMaterialForTeacher(teacher.id, id))!;
    assert.deepEqual([edited.title, edited.url, edited.note, edited.classId], ["Đề cương mới", null, "Ôn trang 5", klass.id]);

    await deleteMaterial(teacher.id, id);
    assert.equal(await getMaterialForTeacher(teacher.id, id), null);
  });

  test("the class's new teacher takes over, and the old one still sees what they posted", async () => {
    const shared = await makeClass(teacher.id);
    const { id } = await createMaterial(teacher.id, { classId: shared.id, title: "Bài nghe", url: "youtube.com/watch?v=1", note: "" });
    await prisma.classRoom.update({ where: { id: shared.id }, data: { teacherId: otherTeacher.id } });

    const newTeacherGroups = await listMaterialsForTeacher(otherTeacher.id);
    assert.deepEqual(newTeacherGroups.find((g) => g.classId === shared.id)?.materials.map((m) => m.id), [id]);
    await updateMaterial(otherTeacher.id, id, { classId: shared.id, title: "Bài nghe (đã sửa)", url: "youtube.com/watch?v=1", note: "" });

    const oldGroup = (await listMaterialsForTeacher(teacher.id)).find((g) => g.classId === shared.id)!;
    assert.equal(oldGroup.teaching, false);
    assert.deepEqual(oldGroup.materials.map((m) => m.title), ["Bài nghe (đã sửa)"]);
    const teachingGroup = (await listMaterialsForTeacher(teacher.id)).find((g) => g.classId === klass.id)!;
    assert.equal(teachingGroup.teaching, true, "lớp đang dạy hiện cả khi chưa có tài liệu");
  });

  test("the database refuses links that are not http(s) and materials with no content", async () => {
    const base = { classId: klass.id, teacherId: teacher.id, title: "Chặn ở DB" };
    await assert.rejects(prisma.material.create({ data: { ...base, url: "javascript:alert(1)" } }), /Material_url_http_check/);
    await assert.rejects(prisma.material.create({ data: { ...base, url: null, note: "" } }), /Material_content_check/);
  });
});
