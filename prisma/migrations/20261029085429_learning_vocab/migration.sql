-- Học tập: bài giao cho lớp (Assignment), lượt làm bài, bộ từ vựng và bài kiểm tra từ vựng.
-- CreateEnum
CREATE TYPE "AssignmentKind" AS ENUM ('vocab_quiz');

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "teacherId" TEXT,
    "kind" "AssignmentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "opensAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentAttempt" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "score" INTEGER,
    "maxScore" INTEGER NOT NULL,
    "late" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AssignmentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabSet" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "VocabSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabWord" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "partOfSpeech" TEXT,
    "example" TEXT,

    CONSTRAINT "VocabWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabQuiz" (
    "assignmentId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "questionTypes" TEXT[],
    "questionCount" INTEGER NOT NULL,
    "timeLimitMinutes" INTEGER,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "showAnswers" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VocabQuiz_pkey" PRIMARY KEY ("assignmentId")
);

-- CreateTable
CREATE TABLE "VocabAttemptItem" (
    "attemptId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "wordId" TEXT,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "options" TEXT[],
    "correctAnswer" TEXT NOT NULL,
    "answer" TEXT,
    "isCorrect" BOOLEAN,

    CONSTRAINT "VocabAttemptItem_pkey" PRIMARY KEY ("attemptId","position")
);

-- CreateIndex
CREATE INDEX "Assignment_classId_createdAt_idx" ON "Assignment"("classId", "createdAt");

-- CreateIndex
CREATE INDEX "Assignment_teacherId_createdAt_idx" ON "Assignment"("teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "AssignmentAttempt_studentId_idx" ON "AssignmentAttempt"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentAttempt_assignmentId_studentId_attemptNo_key" ON "AssignmentAttempt"("assignmentId", "studentId", "attemptNo");

-- CreateIndex
CREATE INDEX "VocabSet_teacherId_archivedAt_idx" ON "VocabSet"("teacherId", "archivedAt");

-- CreateIndex
CREATE INDEX "VocabWord_setId_position_idx" ON "VocabWord"("setId", "position");

-- CreateIndex
CREATE INDEX "VocabAttemptItem_wordId_idx" ON "VocabAttemptItem"("wordId");

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentAttempt" ADD CONSTRAINT "AssignmentAttempt_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentAttempt" ADD CONSTRAINT "AssignmentAttempt_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabSet" ADD CONSTRAINT "VocabSet_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabWord" ADD CONSTRAINT "VocabWord_setId_fkey" FOREIGN KEY ("setId") REFERENCES "VocabSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabQuiz" ADD CONSTRAINT "VocabQuiz_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabQuiz" ADD CONSTRAINT "VocabQuiz_setId_fkey" FOREIGN KEY ("setId") REFERENCES "VocabSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabAttemptItem" ADD CONSTRAINT "VocabAttemptItem_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "AssignmentAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VocabAttemptItem" ADD CONSTRAINT "VocabAttemptItem_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "VocabWord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
