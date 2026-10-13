-- Khảo sát ẩn danh theo link từng lớp (chỉ chủ trung tâm quản lý).
-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('draft', 'open', 'closed');

-- CreateEnum
CREATE TYPE "SurveyAudience" AS ENUM ('student', 'parent', 'both');

-- CreateEnum
CREATE TYPE "SurveyRespondent" AS ENUM ('student', 'parent');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('rating', 'nps', 'single', 'multi', 'text');

-- CreateEnum
CREATE TYPE "SurveyCategory" AS ENUM ('facilities', 'teacher', 'curriculum', 'center', 'other');

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "audience" "SurveyAudience" NOT NULL DEFAULT 'student',
    "status" "SurveyStatus" NOT NULL DEFAULT 'draft',
    "closesOn" DATE,
    "minGroupSize" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "category" "SurveyCategory" NOT NULL DEFAULT 'other',
    "prompt" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyClassLink" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyClassLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "classId" TEXT,
    "teacherName" TEXT NOT NULL DEFAULT '',
    "respondentRole" "SurveyRespondent" NOT NULL,
    "submittedOn" DATE NOT NULL,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "value" INTEGER,
    "text" TEXT,
    "choices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "hiddenAt" TIMESTAMP(3),

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("responseId","questionId")
);

-- CreateIndex
CREATE INDEX "Survey_status_idx" ON "Survey"("status");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_position_idx" ON "SurveyQuestion"("surveyId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyClassLink_token_key" ON "SurveyClassLink"("token");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyClassLink_surveyId_classId_key" ON "SurveyClassLink"("surveyId", "classId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_classId_idx" ON "SurveyResponse"("surveyId", "classId");

-- CreateIndex
CREATE INDEX "SurveyResponse_submittedOn_idx" ON "SurveyResponse"("submittedOn");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyClassLink" ADD CONSTRAINT "SurveyClassLink_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyClassLink" ADD CONSTRAINT "SurveyClassLink_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

