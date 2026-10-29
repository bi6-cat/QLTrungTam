import { Prisma } from "@prisma/client";
import { prisma } from "@/modules/core";
import { isStudentInClass, listClassesForStudent } from "@/modules/center";
import { assignmentState, type AssignmentState } from "./assignments";
import { LearningError } from "./errors";
import { randomRng, type Rng } from "./random";
import { isCorrectAnswer } from "./vocab/grading";
import { generateQuestions, isQuestionType, type QuestionType } from "./vocab/questions";

/** Nộp trễ tối đa ngần này sau giới hạn thời gian vẫn tính đúng giờ (mạng chậm, bấm nộp sát giờ). */
export const TIME_GRACE_SECONDS = 60;

const quizSelect = {
  questionCount: true,
  questionTypes: true,
  timeLimitMinutes: true,
  maxAttempts: true,
  showAnswers: true
} as const;

type AttemptSummary = { submittedAt: Date | null; score: number | null; maxScore: number; id: string };

function summarize(
  a: { id: string; title: string; opensAt: Date; dueAt: Date | null; closedAt: Date | null; classRoom: { name: string } },
  quiz: { questionCount: number; timeLimitMinutes: number | null; maxAttempts: number } | null,
  attempts: AttemptSummary[],
  now: Date
) {
  const submitted = attempts.filter((t) => t.submittedAt);
  const inProgress = attempts.find((t) => !t.submittedAt) ?? null;
  const state: AssignmentState = assignmentState(a, now);
  const maxAttempts = quiz?.maxAttempts ?? 1;
  return {
    id: a.id,
    title: a.title,
    className: a.classRoom.name,
    dueAt: a.dueAt,
    state,
    questionCount: quiz?.questionCount ?? 0,
    timeLimitMinutes: quiz?.timeLimitMinutes ?? null,
    maxAttempts,
    attemptsUsed: submitted.length,
    bestScore: submitted.length ? Math.max(...submitted.map((t) => t.score ?? 0)) : null,
    maxScore: quiz?.questionCount ?? 0,
    inProgressAttemptId: inProgress?.id ?? null,
    lastAttemptId: submitted.at(-1)?.id ?? null,
    canStart: state === "open" && !inProgress && submitted.length < maxAttempts
  };
}

export type StudentAssignment = ReturnType<typeof summarize>;

/** Bài của các lớp học sinh đang học (đã mở), bài đang mở trước, hạn gần trước. */
export async function listAssignmentsForStudent(studentId: string, now = new Date()) {
  const classIds = (await listClassesForStudent(studentId, now)).map((c) => c.id);
  if (classIds.length === 0) return [];
  const assignments = await prisma.assignment.findMany({
    where: { classId: { in: classIds }, opensAt: { lte: now } },
    orderBy: { createdAt: "desc" },
    include: {
      classRoom: { select: { name: true } },
      vocabQuiz: { select: quizSelect },
      attempts: { where: { studentId }, orderBy: { attemptNo: "asc" }, select: { id: true, submittedAt: true, score: true, maxScore: true } }
    }
  });
  const rank = (s: StudentAssignment) => (s.state === "open" ? (s.canStart || s.inProgressAttemptId ? 0 : 1) : 2);
  return assignments
    .map((a) => summarize(a, a.vocabQuiz, a.attempts, now))
    .sort((x, y) => rank(x) - rank(y) || (x.dueAt?.getTime() ?? Infinity) - (y.dueAt?.getTime() ?? Infinity));
}

async function loadAssignmentForStudent(studentId: string, assignmentId: string, now: Date) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      classRoom: { select: { name: true } },
      vocabQuiz: { select: { ...quizSelect, setId: true } },
      attempts: { where: { studentId }, orderBy: { attemptNo: "asc" }, select: { id: true, attemptNo: true, submittedAt: true, score: true, maxScore: true } }
    }
  });
  if (!assignment || assignment.opensAt > now || !(await isStudentInClass(studentId, assignment.classId, now))) return null;
  return assignment;
}

export async function getAssignmentForStudent(studentId: string, assignmentId: string, now = new Date()) {
  const assignment = await loadAssignmentForStudent(studentId, assignmentId, now);
  return assignment ? summarize(assignment, assignment.vocabQuiz, assignment.attempts, now) : null;
}

/**
 * Bắt đầu lượt mới (hoặc trả lượt đang làm dở). Đề được sinh và chụp lại ngay lúc này. Bấm hai lần
 * cùng lúc thì ràng buộc (bài, học sinh, lượt) chặn lượt thứ hai và trả về lượt vừa tạo.
 */
export async function startAttempt(studentId: string, assignmentId: string, now = new Date(), rng: Rng = randomRng()) {
  const assignment = await loadAssignmentForStudent(studentId, assignmentId, now);
  if (!assignment || !assignment.vocabQuiz) throw new LearningError("Không tìm thấy bài.");
  const inProgress = assignment.attempts.find((t) => !t.submittedAt);
  if (inProgress) return { attemptId: inProgress.id };
  if (assignmentState(assignment, now) !== "open") throw new LearningError("Bài đã đóng, không làm thêm được.");
  const quiz = assignment.vocabQuiz;
  if (assignment.attempts.length >= quiz.maxAttempts) throw new LearningError("Em đã dùng hết số lượt làm bài này.");

  const words = await prisma.vocabWord.findMany({
    where: { setId: quiz.setId },
    select: { id: true, term: true, meaning: true, partOfSpeech: true }
  });
  const types = quiz.questionTypes.filter(isQuestionType) as QuestionType[];
  let questions;
  try {
    questions = generateQuestions(words, types, quiz.questionCount, rng);
  } catch {
    throw new LearningError("Bộ từ của bài vừa bị sửa nên không đủ câu. Báo thầy cô kiểm tra lại bài.");
  }

  const attemptNo = (assignment.attempts.at(-1)?.attemptNo ?? 0) + 1;
  try {
    const attempt = await prisma.assignmentAttempt.create({
      data: {
        assignmentId,
        studentId,
        attemptNo,
        startedAt: now,
        maxScore: questions.length,
        vocabItems: { create: questions.map((q, i) => ({ ...q, position: i + 1 })) }
      },
      select: { id: true }
    });
    return { attemptId: attempt.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.assignmentAttempt.findFirst({
        where: { assignmentId, studentId, attemptNo },
        select: { id: true }
      });
      if (existing) return { attemptId: existing.id };
    }
    throw error;
  }
}

function deadline(startedAt: Date, timeLimitMinutes: number | null) {
  return timeLimitMinutes ? new Date(startedAt.getTime() + timeLimitMinutes * 60_000) : null;
}

/**
 * Lượt làm bài của chính học sinh này. Trước khi nộp không có đáp án đúng trong kết quả; sau khi
 * nộp chỉ có nếu bài cho xem đáp án.
 */
export async function getAttemptForStudent(studentId: string, attemptId: string, now = new Date()) {
  const attempt = await prisma.assignmentAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: {
      assignment: { select: { id: true, title: true, vocabQuiz: { select: { timeLimitMinutes: true, showAnswers: true, maxAttempts: true } } } },
      vocabItems: { orderBy: { position: "asc" } }
    }
  });
  if (!attempt) return null;
  const quiz = attempt.assignment.vocabQuiz;
  const submitted = attempt.submittedAt !== null;
  const reveal = submitted && (quiz?.showAnswers ?? false);
  const endsAt = deadline(attempt.startedAt, quiz?.timeLimitMinutes ?? null);
  return {
    id: attempt.id,
    assignmentId: attempt.assignment.id,
    title: attempt.assignment.title,
    attemptNo: attempt.attemptNo,
    startedAt: attempt.startedAt,
    endsAt,
    expired: !submitted && endsAt !== null && endsAt <= now,
    submittedAt: attempt.submittedAt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    late: attempt.late,
    showAnswers: quiz?.showAnswers ?? false,
    items: attempt.vocabItems.map((item) => ({
      position: item.position,
      type: item.type as QuestionType,
      prompt: item.prompt,
      options: item.options,
      answer: submitted ? item.answer : null,
      isCorrect: submitted ? item.isCorrect : null,
      correctAnswer: reveal ? item.correctAnswer : null
    }))
  };
}

const MAX_ANSWER_LENGTH = 200;

/**
 * Chấm và khoá lượt làm bài. Chỉ lượt chưa nộp mới được chấm (hai lần nộp cùng lúc chỉ một lần có
 * tác dụng). Nộp sau giới hạn thời gian + ân hạn vẫn chấm nhưng đánh dấu trễ.
 */
export async function submitAttempt(studentId: string, attemptId: string, answers: ReadonlyMap<number, string>, now = new Date()) {
  const attempt = await prisma.assignmentAttempt.findFirst({
    where: { id: attemptId, studentId },
    include: { assignment: { select: { vocabQuiz: { select: { timeLimitMinutes: true } } } }, vocabItems: true }
  });
  if (!attempt) throw new LearningError("Không tìm thấy lượt làm bài.");
  if (attempt.submittedAt) return { score: attempt.score ?? 0, maxScore: attempt.maxScore, alreadySubmitted: true };

  const endsAt = deadline(attempt.startedAt, attempt.assignment.vocabQuiz?.timeLimitMinutes ?? null);
  const late = endsAt !== null && now.getTime() > endsAt.getTime() + TIME_GRACE_SECONDS * 1000;
  const graded = attempt.vocabItems.map((item) => {
    const raw = answers.get(item.position);
    const answer = raw?.trim() ? raw.slice(0, MAX_ANSWER_LENGTH) : null;
    return { position: item.position, answer, isCorrect: isCorrectAnswer({ ...item, type: item.type as QuestionType }, answer) };
  });
  const score = graded.filter((g) => g.isCorrect).length;

  const locked = await prisma.$transaction(async (tx) => {
    const claimed = await tx.assignmentAttempt.updateMany({
      where: { id: attemptId, submittedAt: null },
      data: { submittedAt: now, score, late }
    });
    if (claimed.count === 0) return false;
    for (const g of graded) {
      await tx.vocabAttemptItem.update({
        where: { attemptId_position: { attemptId, position: g.position } },
        data: { answer: g.answer, isCorrect: g.isCorrect }
      });
    }
    return true;
  });
  if (!locked) {
    const current = await prisma.assignmentAttempt.findUniqueOrThrow({ where: { id: attemptId }, select: { score: true, maxScore: true } });
    return { score: current.score ?? 0, maxScore: current.maxScore, alreadySubmitted: true };
  }
  return { score, maxScore: attempt.maxScore, alreadySubmitted: false };
}
