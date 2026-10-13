"use server";

import { Prisma } from "@prisma/client";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure } from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import { isoToDbDate, todayInVietnam } from "@/lib/class-sessions";
import { prisma } from "@/lib/prisma";
import { generatePublicToken } from "@/lib/publicToken";
import { checkRateLimit, recordFailure } from "@/lib/rate-limit";
import {
  findSurveyTemplate,
  isChoiceType,
  isPastClosingDay,
  MAX_OPTIONS,
  parseOptionLines,
  parseSurveySubmission,
  type SurveyStatus
} from "@/lib/survey-core";
import { resolveSurveyLink, surveyAcceptsResponses } from "@/lib/surveys";
import { createSurveySchema, safeParseForm, saveSurveyQuestionSchema, updateSurveySchema } from "@/lib/validation";

// Chỉ chủ trung tâm quản lý khảo sát: mọi action admin ở đây gọi requireAdmin().

/** Token link khảo sát trùng (rất hiếm) thì sinh lại cả lượt. */
async function withFreshTokens<T>(work: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? String(error.meta?.target ?? "") : "";
      if (target.includes("token") && attempt < 5) continue;
      throw error;
    }
  }
}

export async function createSurveyAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createSurveySchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  const template = findSurveyTemplate(data.templateKey);
  if (!template) return errorState("Mẫu khảo sát không tồn tại.");

  let surveyId: string;
  try {
    // Mặc định gửi cho mọi lớp đang hoạt động; bỏ bớt lớp ở tab "Gửi link".
    const classes = await prisma.classRoom.findMany({ where: { archivedAt: null }, select: { id: true } });
    const survey = await withFreshTokens(() =>
      prisma.survey.create({
        data: {
          title: data.title,
          description: template.description,
          audience: data.audience,
          questions: {
            create: template.questions.map((question, index) => ({
              position: index + 1,
              type: question.type,
              category: question.category,
              prompt: question.prompt,
              required: question.required ?? true,
              options: question.options ?? []
            }))
          },
          links: { create: classes.map((classRoom) => ({ classId: classRoom.id, token: generatePublicToken() })) }
        },
        select: { id: true }
      })
    );
    surveyId = survey.id;
  } catch (createError) {
    return actionFailure(createError, "Không tạo được khảo sát.");
  }
  redirect(`/admin/surveys/${surveyId}?tab=questions`);
}

export async function updateSurveyAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateSurveySchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const survey = await prisma.survey.findUnique({
    where: { id: data.id },
    select: { audience: true, _count: { select: { responses: true } } }
  });
  if (!survey) return errorState("Khảo sát không còn tồn tại.");
  if (survey._count.responses > 0 && survey.audience !== data.audience) {
    return errorState("Khảo sát đã có phiếu trả lời nên không đổi được đối tượng.");
  }

  await prisma.survey.update({
    where: { id: data.id },
    data: {
      title: data.title,
      description: data.description,
      audience: data.audience,
      closesOn: data.closesOn ? isoToDbDate(data.closesOn) : null,
      minGroupSize: data.minGroupSize
    }
  });
  return successState("Đã lưu thông tin khảo sát.");
}

export async function setSurveyStatusAction(surveyId: string, status: SurveyStatus): Promise<ResultState> {
  await requireAdmin();
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    select: { closesOn: true, _count: { select: { questions: true, links: true } } }
  });
  if (!survey) return errorState("Khảo sát không còn tồn tại.");

  if (status === "open") {
    if (survey._count.questions === 0) return errorState("Thêm ít nhất một câu hỏi trước khi mở khảo sát.");
    if (survey._count.links === 0) return errorState("Chọn ít nhất một lớp ở tab Gửi link trước khi mở khảo sát.");
    const closesOn = survey.closesOn ? survey.closesOn.toISOString().slice(0, 10) : null;
    if (isPastClosingDay(closesOn, todayInVietnam())) {
      return errorState("Ngày đóng khảo sát đã qua. Hãy đổi ngày đóng trước khi mở lại.");
    }
  }

  await prisma.survey.update({ where: { id: surveyId }, data: { status } });
  return successState(
    status === "open" ? "Đã mở khảo sát, các link lớp bắt đầu nhận phiếu." : status === "closed" ? "Đã đóng khảo sát." : "Đã chuyển về nháp."
  );
}

export async function deleteSurveyAction(surveyId: string): Promise<ResultState> {
  await requireAdmin();
  const deleted = await prisma.survey.deleteMany({ where: { id: surveyId } });
  if (deleted.count !== 1) return errorState("Khảo sát không còn tồn tại.");
  return successState("Đã xóa khảo sát.");
}

/** Đã có phiếu thì khóa câu hỏi: sửa câu hỏi/lựa chọn sẽ làm sai nghĩa các phiếu cũ. */
async function questionsLocked(surveyId: string) {
  const count = await prisma.surveyResponse.count({ where: { surveyId } });
  return count > 0;
}

const LOCKED_MESSAGE = "Khảo sát đã có phiếu trả lời nên không sửa câu hỏi được nữa. Hãy tạo khảo sát mới nếu cần đổi câu hỏi.";

export async function saveSurveyQuestionAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(saveSurveyQuestionSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  if (await questionsLocked(data.surveyId)) return errorState(LOCKED_MESSAGE);

  const options = isChoiceType(data.type) ? parseOptionLines(data.options) : [];
  if (isChoiceType(data.type) && options.length < 2) return errorState("Câu chọn đáp án cần ít nhất 2 lựa chọn.");
  if (options.length > MAX_OPTIONS) return errorState(`Tối đa ${MAX_OPTIONS} lựa chọn cho một câu hỏi.`);

  const fields = {
    type: data.type,
    category: data.category,
    prompt: data.prompt,
    required: data.required,
    options
  };
  try {
    if (data.questionId) {
      const updated = await prisma.surveyQuestion.updateMany({
        where: { id: data.questionId, surveyId: data.surveyId },
        data: fields
      });
      if (updated.count !== 1) return errorState("Câu hỏi không còn tồn tại.");
      return successState("Đã lưu câu hỏi.");
    }
    const last = await prisma.surveyQuestion.aggregate({ where: { surveyId: data.surveyId }, _max: { position: true } });
    await prisma.surveyQuestion.create({
      data: { ...fields, surveyId: data.surveyId, position: (last._max.position ?? 0) + 1 }
    });
  } catch (saveError) {
    return actionFailure(saveError, "Không lưu được câu hỏi.");
  }
  return successState("Đã thêm câu hỏi.");
}

export async function deleteSurveyQuestionAction(questionId: string): Promise<ResultState> {
  await requireAdmin();
  const question = await prisma.surveyQuestion.findUnique({ where: { id: questionId }, select: { surveyId: true } });
  if (!question) return errorState("Câu hỏi không còn tồn tại.");
  if (await questionsLocked(question.surveyId)) return errorState(LOCKED_MESSAGE);
  await prisma.surveyQuestion.delete({ where: { id: questionId } });
  return successState("Đã xóa câu hỏi.");
}

export async function moveSurveyQuestionAction(questionId: string, direction: "up" | "down"): Promise<ResultState> {
  await requireAdmin();
  const question = await prisma.surveyQuestion.findUnique({
    where: { id: questionId },
    select: { surveyId: true, position: true }
  });
  if (!question) return errorState("Câu hỏi không còn tồn tại.");
  if (await questionsLocked(question.surveyId)) return errorState(LOCKED_MESSAGE);

  const neighbor = await prisma.surveyQuestion.findFirst({
    where: {
      surveyId: question.surveyId,
      position: direction === "up" ? { lt: question.position } : { gt: question.position }
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
    select: { id: true, position: true }
  });
  if (!neighbor) return successState("");
  await prisma.$transaction([
    prisma.surveyQuestion.update({ where: { id: questionId }, data: { position: neighbor.position } }),
    prisma.surveyQuestion.update({ where: { id: neighbor.id }, data: { position: question.position } })
  ]);
  return successState("Đã đổi thứ tự câu hỏi.");
}

export async function setSurveyClassesAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const surveyId = String(formData.get("surveyId") ?? "");
  const wanted = new Set(formData.getAll("classId").map(String).filter(Boolean));

  const [survey, classes] = await Promise.all([
    prisma.survey.findUnique({ where: { id: surveyId }, select: { links: { select: { classId: true } } } }),
    prisma.classRoom.findMany({ where: { id: { in: [...wanted] }, archivedAt: null }, select: { id: true } })
  ]);
  if (!survey) return errorState("Khảo sát không còn tồn tại.");
  if (classes.length !== wanted.size) return errorState("Có lớp không còn hoạt động, hãy tải lại trang.");

  const current = new Set(survey.links.map((link) => link.classId));
  const toAdd = [...wanted].filter((classId) => !current.has(classId));
  const toRemove = [...current].filter((classId) => !wanted.has(classId));
  try {
    // Bỏ lớp chỉ xóa link (link cũ ngừng hoạt động); phiếu lớp đó đã nộp vẫn giữ.
    await withFreshTokens(() =>
      prisma.$transaction([
        prisma.surveyClassLink.deleteMany({ where: { surveyId, classId: { in: toRemove } } }),
        prisma.surveyClassLink.createMany({
          data: toAdd.map((classId) => ({ surveyId, classId, token: generatePublicToken() }))
        })
      ])
    );
  } catch (saveError) {
    return actionFailure(saveError, "Không lưu được danh sách lớp.");
  }
  return successState(`Đã lưu: khảo sát gửi cho ${wanted.size} lớp.`);
}

export async function setSurveyCommentHiddenAction(
  responseId: string,
  questionId: string,
  hidden: boolean
): Promise<ResultState> {
  await requireAdmin();
  const updated = await prisma.surveyAnswer.updateMany({
    where: { responseId, questionId },
    data: { hiddenAt: hidden ? new Date() : null }
  });
  if (updated.count !== 1) return errorState("Góp ý không còn tồn tại.");
  return successState(hidden ? "Đã ẩn góp ý." : "Đã hiện lại góp ý.");
}

// ---------------------------------------------------------------------------
// Trang công khai /survey/<MÃ LỚP>-<token>
// ---------------------------------------------------------------------------

// Học sinh có thể cùng điền qua wifi của trung tâm (chung IP) nên giới hạn khá rộng.
const SUBMIT_LIMIT = { max: 40, windowMs: 10 * 60 * 1000 };
const DONE_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;

function doneCookieName(surveyId: string, role: string) {
  return `survey_done_${surveyId}_${role}`;
}

/**
 * Nộp phiếu ẩn danh. Cố ý không lưu IP, trình duyệt hay giờ nộp; IP chỉ dùng cho bộ đếm chống
 * spam trong bộ nhớ. Cookie "đã nộp" chỉ ghi trên máy người trả lời để nhắc khi mở lại link.
 */
export async function submitSurveyAction(slug: string, _prevState: ResultState, formData: FormData): Promise<ResultState> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  const rateKey = `survey:${ip}`;
  const limit = checkRateLimit(rateKey, SUBMIT_LIMIT);
  if (!limit.allowed) {
    return errorState(`Có quá nhiều phiếu gửi từ mạng này. Vui lòng thử lại sau ${limit.retryAfterSec} giây.`);
  }

  const link = await resolveSurveyLink(slug);
  if (!link) return errorState("Link khảo sát không còn hoạt động.");
  const { survey, classRoom } = link;
  if (!surveyAcceptsResponses(survey) || classRoom.archivedAt) {
    return errorState("Khảo sát đã đóng, cảm ơn bạn đã quan tâm.");
  }

  const parsed = parseSurveySubmission(survey.questions, survey.audience, formData);
  if ("error" in parsed) return errorState(parsed.error);

  const cookieStore = await cookies();
  const cookieName = doneCookieName(survey.id, parsed.respondentRole);
  if (cookieStore.get(cookieName)) {
    return errorState("Máy này đã gửi phiếu cho khảo sát này rồi. Cảm ơn bạn!");
  }

  recordFailure(rateKey, SUBMIT_LIMIT); // đếm mọi lượt nộp, không chỉ lượt lỗi
  try {
    await prisma.surveyResponse.create({
      data: {
        surveyId: survey.id,
        classId: classRoom.id,
        teacherName: classRoom.teacherName,
        respondentRole: parsed.respondentRole,
        submittedOn: isoToDbDate(todayInVietnam()),
        answers: {
          create: parsed.answers.map((answer) => ({
            questionId: answer.questionId,
            value: answer.value,
            text: answer.text,
            choices: answer.choices
          }))
        }
      }
    });
  } catch (submitError) {
    return actionFailure(submitError, "Chưa gửi được phiếu.");
  }

  cookieStore.set(cookieName, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: DONE_COOKIE_MAX_AGE,
    path: "/survey"
  });
  return successState("Cảm ơn bạn đã dành thời gian góp ý!");
}
