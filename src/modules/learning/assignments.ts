import { prisma } from "@/modules/core";
import { isTeacherOfClass, listClassesForTeacher, listCurrentStudentsInClass } from "@/modules/center";
import { LearningError } from "./errors";
import { isQuestionType, quizConfigError, type QuestionType } from "./vocab/questions";
import { getVocabSet } from "./vocab/sets";

export type AssignmentState = "upcoming" | "open" | "closed";

export const MAX_ATTEMPTS = 5;
export const MAX_TIME_LIMIT_MINUTES = 180;

/** Trạng thái bài lúc `now`: chưa mở, đang mở, hay đã đóng (đóng tay hoặc quá hạn). */
export function assignmentState(a: { opensAt: Date; dueAt: Date | null; closedAt: Date | null }, now: Date): AssignmentState {
  if (a.closedAt && a.closedAt <= now) return "closed";
  if (a.dueAt && a.dueAt <= now) return "closed";
  if (a.opensAt > now) return "upcoming";
  return "open";
}

export type VocabAssignmentInput = {
  classId: string;
  setId: string;
  title: string;
  questionTypes: string[];
  questionCount: number;
  timeLimitMinutes: number | null;
  maxAttempts: number;
  dueAt: Date | null;
  showAnswers: boolean;
};

export async function createVocabAssignment(teacherId: string, input: VocabAssignmentInput, now = new Date()) {
  if (!(await isTeacherOfClass(teacherId, input.classId))) throw new LearningError("Thầy cô không được gán dạy lớp này.");
  const set = await getVocabSet(teacherId, input.setId);
  if (!set) throw new LearningError("Không tìm thấy bộ từ.");

  const types = [...new Set(input.questionTypes)].filter(isQuestionType) as QuestionType[];
  const configError = quizConfigError(set.words.length, types, input.questionCount);
  if (configError) throw new LearningError(configError);
  const title = input.title.trim() || set.title;
  if (title.length > 120) throw new LearningError("Tên bài tối đa 120 ký tự.");
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1 || input.maxAttempts > MAX_ATTEMPTS) {
    throw new LearningError(`Số lượt làm từ 1 đến ${MAX_ATTEMPTS}.`);
  }
  if (input.timeLimitMinutes !== null) {
    const t = input.timeLimitMinutes;
    if (!Number.isInteger(t) || t < 1 || t > MAX_TIME_LIMIT_MINUTES) {
      throw new LearningError(`Thời gian làm bài từ 1 đến ${MAX_TIME_LIMIT_MINUTES} phút, hoặc để trống nếu không giới hạn.`);
    }
  }
  if (input.dueAt && input.dueAt <= now) throw new LearningError("Hạn nộp phải sau thời điểm hiện tại.");

  return prisma.assignment.create({
    data: {
      classId: input.classId,
      teacherId,
      kind: "vocab_quiz",
      title,
      opensAt: now,
      dueAt: input.dueAt,
      vocabQuiz: {
        create: {
          setId: set.id,
          questionTypes: types,
          questionCount: input.questionCount,
          timeLimitMinutes: input.timeLimitMinutes,
          maxAttempts: input.maxAttempts,
          showAnswers: input.showAnswers
        }
      }
    },
    select: { id: true }
  });
}

/** Người giao bài, hoặc giáo viên đang dạy lớp đó (lớp đổi giáo viên thì người mới quản lý tiếp). */
async function loadManagedAssignment(teacherId: string, assignmentId: string) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: { classRoom: { select: { name: true } }, vocabQuiz: { include: { set: { select: { title: true } } } } }
  });
  if (!assignment) return null;
  if (assignment.teacherId === teacherId || (await isTeacherOfClass(teacherId, assignment.classId))) return assignment;
  return null;
}

export async function closeAssignment(teacherId: string, assignmentId: string, now = new Date()) {
  const assignment = await loadManagedAssignment(teacherId, assignmentId);
  if (!assignment) throw new LearningError("Không tìm thấy bài.");
  if (assignmentState(assignment, now) === "closed") return;
  await prisma.assignment.update({ where: { id: assignmentId }, data: { closedAt: now } });
}

export async function listAssignmentsForTeacher(teacherId: string, now = new Date()) {
  const classes = await listClassesForTeacher(teacherId, now);
  const classSize = new Map(classes.map((c) => [c.id, c.studentCount]));
  const assignments = await prisma.assignment.findMany({
    where: { OR: [{ teacherId }, { classId: { in: [...classSize.keys()] } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      kind: true,
      classId: true,
      opensAt: true,
      dueAt: true,
      closedAt: true,
      createdAt: true,
      classRoom: { select: { name: true } },
      vocabQuiz: { select: { questionCount: true } },
      attempts: { where: { submittedAt: { not: null } }, select: { studentId: true }, distinct: ["studentId"] }
    }
  });
  return assignments.map(({ attempts, classRoom, vocabQuiz, ...a }) => ({
    ...a,
    className: classRoom.name,
    questionCount: vocabQuiz?.questionCount ?? 0,
    state: assignmentState(a, now),
    submittedStudents: attempts.length,
    classSize: classSize.get(a.classId) ?? null
  }));
}

export type StudentResult = {
  studentId: string;
  fullName: string;
  /** Không còn trong lớp nhưng đã làm bài. */
  leftClass: boolean;
  submittedAttempts: number;
  bestScore: number | null;
  lastSubmittedAt: Date | null;
  inProgress: boolean;
  late: boolean;
};

export async function getAssignmentResults(teacherId: string, assignmentId: string, now = new Date()) {
  const assignment = await loadManagedAssignment(teacherId, assignmentId);
  if (!assignment) return null;

  const [roster, attempts, items] = await Promise.all([
    listCurrentStudentsInClass(assignment.classId, now),
    prisma.assignmentAttempt.findMany({
      where: { assignmentId },
      orderBy: { attemptNo: "asc" },
      select: { studentId: true, submittedAt: true, score: true, maxScore: true, late: true, student: { select: { fullName: true } } }
    }),
    prisma.vocabAttemptItem.findMany({
      where: { attempt: { assignmentId, submittedAt: { not: null } } },
      select: { wordId: true, type: true, prompt: true, correctAnswer: true, isCorrect: true, word: { select: { term: true } } }
    })
  ]);

  const rows = new Map<string, StudentResult>();
  const ensure = (studentId: string, fullName: string, leftClass: boolean) => {
    if (!rows.has(studentId)) {
      rows.set(studentId, { studentId, fullName, leftClass, submittedAttempts: 0, bestScore: null, lastSubmittedAt: null, inProgress: false, late: false });
    }
    return rows.get(studentId)!;
  };
  for (const s of roster) ensure(s.id, s.fullName, false);
  for (const a of attempts) {
    const row = ensure(a.studentId, a.student.fullName, true);
    if (!a.submittedAt) {
      row.inProgress = true;
      continue;
    }
    row.submittedAttempts += 1;
    row.bestScore = Math.max(row.bestScore ?? 0, a.score ?? 0);
    row.lastSubmittedAt = a.submittedAt;
    row.late ||= a.late;
  }

  // Từ hay sai: gom theo từ gốc; từ đã bị xoá khỏi bộ thì gom theo chữ của từ trong đề.
  const words = new Map<string, { label: string; total: number; wrong: number }>();
  for (const item of items) {
    const label = item.word?.term ?? (item.type === "mc_meaning" ? item.prompt : item.correctAnswer);
    const key = item.wordId ?? `text:${label}`;
    const stat = words.get(key) ?? { label, total: 0, wrong: 0 };
    stat.total += 1;
    if (!item.isCorrect) stat.wrong += 1;
    words.set(key, stat);
  }
  const hardWords = [...words.values()]
    .filter((w) => w.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total || b.wrong - a.wrong)
    .slice(0, 10);

  const students = [...rows.values()].sort(
    (a, b) => Number(a.leftClass) - Number(b.leftClass) || a.fullName.localeCompare(b.fullName, "vi")
  );
  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      className: assignment.classRoom.name,
      setTitle: assignment.vocabQuiz?.set.title ?? "",
      questionCount: assignment.vocabQuiz?.questionCount ?? 0,
      questionTypes: assignment.vocabQuiz?.questionTypes ?? [],
      timeLimitMinutes: assignment.vocabQuiz?.timeLimitMinutes ?? null,
      maxAttempts: assignment.vocabQuiz?.maxAttempts ?? 1,
      dueAt: assignment.dueAt,
      state: assignmentState(assignment, now)
    },
    students,
    hardWords
  };
}
