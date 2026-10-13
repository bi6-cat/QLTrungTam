import { parseClassLinkSlug } from "@/lib/class-links";
import { isoFromDbDate, todayInVietnam } from "@/lib/class-sessions";
import { prisma } from "@/lib/prisma";
import {
  average,
  DEFAULT_MIN_GROUP_SIZE,
  isPastClosingDay,
  meetsThreshold,
  overallRating,
  summarizeNps,
  type ResponseRow,
  type SurveyCategory
} from "@/lib/survey-core";

/** Số học sinh đang học của từng lớp (mẫu số tỉ lệ trả lời). */
export async function activeStudentCounts() {
  const enrollments = await prisma.enrollment.findMany({
    where: { status: "active", leftAt: null, student: { archivedAt: null }, classRoom: { archivedAt: null } },
    select: { classId: true }
  });
  const counts = new Map<string, number>();
  for (const { classId } of enrollments) counts.set(classId, (counts.get(classId) ?? 0) + 1);
  return counts;
}

/** Khảo sát còn nhận phiếu: đang mở và chưa qua ngày đóng (giờ Việt Nam). */
export function surveyAcceptsResponses(survey: { status: string; closesOn: Date | null }, now = new Date()) {
  if (survey.status !== "open") return false;
  return !isPastClosingDay(survey.closesOn ? isoFromDbDate(survey.closesOn) : null, todayInVietnam(now));
}

/** Tìm khảo sát + lớp từ /survey/<MÃ LỚP>-<token>; mã lớp phải khớp với token. */
export async function resolveSurveyLink(slug: string) {
  const parsed = parseClassLinkSlug(slug);
  if (!parsed) return null;
  const link = await prisma.surveyClassLink.findUnique({
    where: { token: parsed.token },
    include: {
      classRoom: { select: { id: true, name: true, shortCode: true, teacherName: true, archivedAt: true } },
      survey: { include: { questions: { orderBy: { position: "asc" } } } }
    }
  });
  if (!link || link.classRoom.shortCode.toUpperCase() !== parsed.shortCode) return null;
  return link;
}

function toResponseRows(
  responses: {
    id: string;
    classId: string | null;
    teacherName: string;
    respondentRole: ResponseRow["respondentRole"];
    answers: { questionId: string; value: number | null; text: string | null; choices: number[]; hiddenAt: Date | null }[];
  }[]
): ResponseRow[] {
  return responses.map((response) => ({
    id: response.id,
    classId: response.classId,
    teacherName: response.teacherName,
    respondentRole: response.respondentRole,
    answers: response.answers.map((answer) => ({
      questionId: answer.questionId,
      value: answer.value,
      text: answer.text,
      choices: answer.choices,
      hidden: answer.hiddenAt !== null
    }))
  }));
}

const responseSelect = {
  id: true,
  classId: true,
  teacherName: true,
  respondentRole: true,
  answers: { select: { questionId: true, value: true, text: true, choices: true, hiddenAt: true } }
} as const;

/** Trang tổng hợp: danh sách khảo sát kèm số liệu và điểm gom qua mọi đợt. */
export async function getSurveyOverview(now = new Date()) {
  const [surveys, studentCounts] = await Promise.all([
    prisma.survey.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        questions: { select: { id: true, type: true, category: true } },
        links: { select: { classId: true } },
        // Sắp theo id (UUID ngẫu nhiên) để thứ tự không lộ thứ tự nộp.
        responses: { select: { ...responseSelect, submittedOn: true }, orderBy: { id: "asc" } }
      }
    }),
    activeStudentCounts()
  ]);

  const today = todayInVietnam(now);
  const thirtyDaysAgo = isoFromDbDate(new Date(Date.parse(`${today}T00:00:00.000Z`) - 29 * 86_400_000));

  const items = surveys.map((survey) => {
    const responses = toResponseRows(survey.responses);
    const npsIds = new Set(survey.questions.filter((q) => q.type === "nps").map((q) => q.id));
    const npsValues = responses.flatMap((response) =>
      response.answers.filter((a) => npsIds.has(a.questionId) && a.value !== null).map((a) => a.value as number)
    );
    const studentCount = survey.links.reduce((sum, link) => sum + (studentCounts.get(link.classId) ?? 0), 0);
    return {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      audience: survey.audience,
      createdAt: survey.createdAt,
      closesOn: survey.closesOn ? isoFromDbDate(survey.closesOn) : null,
      acceptsResponses: surveyAcceptsResponses(survey, now),
      questionCount: survey.questions.length,
      classCount: survey.links.length,
      studentCount,
      responseCount: responses.length,
      recentResponseCount: survey.responses.filter((r) => isoFromDbDate(r.submittedOn) >= thirtyDaysAgo).length,
      minGroupSize: survey.minGroupSize,
      rating: overallRating(survey.questions, responses),
      nps: npsValues.length > 0 ? summarizeNps(npsValues).score : null,
      questions: survey.questions,
      responses
    };
  });

  // Điểm theo nhóm đánh giá và theo giáo viên, gom mọi đợt khảo sát.
  const categoryValues = new Map<SurveyCategory, number[]>();
  const teacherStats = new Map<string, { values: number[]; responses: Set<string> }>();
  for (const item of items) {
    const ratingCategory = new Map(
      item.questions.filter((q) => q.type === "rating").map((q) => [q.id, q.category] as const)
    );
    for (const response of item.responses) {
      for (const answer of response.answers) {
        const category = ratingCategory.get(answer.questionId);
        if (!category || answer.value === null) continue;
        categoryValues.set(category, [...(categoryValues.get(category) ?? []), answer.value]);
        if (category === "teacher" && response.teacherName.trim()) {
          const name = response.teacherName.trim();
          const stat = teacherStats.get(name) ?? { values: [], responses: new Set<string>() };
          stat.values.push(answer.value);
          stat.responses.add(response.id);
          teacherStats.set(name, stat);
        }
      }
    }
  }

  const categories = [...categoryValues.entries()].map(([category, values]) => ({
    category,
    average: average(values),
    count: values.length
  }));
  const teachers = [...teacherStats.entries()]
    .map(([name, stat]) => ({
      name,
      average: average(stat.values),
      responseCount: stat.responses.size,
      visible: meetsThreshold(stat.responses.size, DEFAULT_MIN_GROUP_SIZE)
    }))
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  const allRatings = items.flatMap((item) => {
    const ids = new Set(item.questions.filter((q) => q.type === "rating").map((q) => q.id));
    return item.responses.flatMap((r) =>
      r.answers.filter((a) => ids.has(a.questionId) && a.value !== null).map((a) => a.value as number)
    );
  });
  const latestNps = items.find((item) => item.nps !== null && meetsThreshold(item.responseCount, item.minGroupSize)) ?? null;

  return {
    items: items.map(({ questions: _questions, responses: _responses, ...rest }) => rest),
    totals: {
      openCount: items.filter((item) => item.acceptsResponses).length,
      responseCount: items.reduce((sum, item) => sum + item.responseCount, 0),
      recentResponseCount: items.reduce((sum, item) => sum + item.recentResponseCount, 0),
      rating: average(allRatings),
      latestNps: latestNps ? { score: latestNps.nps, title: latestNps.title } : null
    },
    categories,
    teachers
  };
}

/** Trang chi tiết một khảo sát: câu hỏi, link các lớp và toàn bộ phiếu (đã ẩn danh). */
export async function getSurveyDetail(surveyId: string) {
  const survey = await prisma.survey.findUnique({
    where: { id: surveyId },
    include: {
      questions: { orderBy: { position: "asc" } },
      links: {
        include: { classRoom: { select: { id: true, name: true, shortCode: true, teacherName: true, archivedAt: true } } }
      },
      responses: { select: { ...responseSelect, submittedOn: true }, orderBy: { id: "asc" } }
    }
  });
  if (!survey) return null;
  return {
    ...survey,
    closesOn: survey.closesOn ? isoFromDbDate(survey.closesOn) : null,
    acceptsResponses: surveyAcceptsResponses(survey),
    responses: toResponseRows(survey.responses).map((row, index) => ({
      ...row,
      submittedOn: isoFromDbDate(survey.responses[index].submittedOn)
    }))
  };
}
