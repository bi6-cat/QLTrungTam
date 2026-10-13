import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, Inbox, ListChecks, MessageSquareText, Send, ShieldCheck, Star, ThumbsUp, Users } from "lucide-react";
import { clsx } from "clsx";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { CommentVisibilityButton } from "@/components/surveys/CommentVisibilityButton";
import { QuestionEditor } from "@/components/surveys/QuestionEditor";
import { CountBar, ScoreBar, scoreTone } from "@/components/surveys/ScoreBar";
import { SurveyHeaderActions } from "@/components/surveys/SurveyHeaderActions";
import { SurveyLinksPanel } from "@/components/surveys/SurveyLinksPanel";
import { requireAdmin } from "@/lib/auth";
import { surveyPath } from "@/lib/class-links";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  categoryAverages,
  formatPercent,
  formatScore,
  meetsThreshold,
  overallRating,
  QUESTION_TYPE_LABEL,
  RESPONDENT_LABEL,
  STATUS_LABEL,
  summarizeNps,
  summarizeQuestion,
  type ResponseRow,
  type SurveyRespondent
} from "@/lib/survey-core";
import { activeStudentCounts, getSurveyDetail } from "@/lib/surveys";

export const dynamic = "force-dynamic";

type Tab = "results" | "responses" | "questions" | "share";

const RESPONSES_PER_PAGE = 50;

function tabHref(surveyId: string, tab: Tab, extra: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams({ tab });
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  return `/admin/surveys/${surveyId}?${params.toString()}`;
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={clsx(
        "focus-ring inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
        active ? "bg-neutralText text-white" : "bg-white text-stone-600 ring-1 ring-inset ring-stone-200 hover:bg-stone-50"
      )}
    >
      {children}
    </Link>
  );
}

export default async function SurveyDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ surveyId: string }>;
  searchParams: Promise<{ tab?: string; class?: string; role?: string; page?: string }>;
}) {
  await requireAdmin();
  const { surveyId } = await params;
  const query = await searchParams;
  const [survey, studentCounts, activeClasses, settings] = await Promise.all([
    getSurveyDetail(surveyId),
    activeStudentCounts(),
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, shortCode: true, teacherName: true }
    }),
    getAppSettings()
  ]);
  if (!survey) notFound();

  const responseCount = survey.responses.length;
  const tab: Tab =
    query.tab === "questions" || query.tab === "share" || query.tab === "results" || query.tab === "responses"
      ? query.tab
      : responseCount > 0
        ? "results"
        : "questions";

  const responsesByClass = new Map<string, number>();
  for (const response of survey.responses) {
    if (response.classId) responsesByClass.set(response.classId, (responsesByClass.get(response.classId) ?? 0) + 1);
  }
  const linkByClass = new Map(survey.links.map((link) => [link.classId, link]));
  const className = new Map<string, string>([
    ...survey.links.map((link) => [link.classId, link.classRoom.name] as const),
    ...activeClasses.map((c) => [c.id, c.name] as const)
  ]);
  const studentTotal = survey.links.reduce((sum, link) => sum + (studentCounts.get(link.classId) ?? 0), 0);

  const classFilter = query.class && className.has(query.class) ? query.class : undefined;
  const roleFilter: SurveyRespondent | undefined =
    query.role === "student" || query.role === "parent" ? query.role : undefined;

  const statusLabel = survey.status === "open" && !survey.acceptsResponses ? "Hết hạn" : STATUS_LABEL[survey.status];

  return (
    <div className="grid gap-5">
      <Link
        href="/admin/surveys"
        className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-stone-500 hover:text-neutralText"
      >
        <ArrowLeft className="h-4 w-4" />
        Tất cả khảo sát
      </Link>
      <PageHeader
        title={survey.title}
        description={`${AUDIENCE_LABEL[survey.audience]} · ${survey.links.length} lớp · ${responseCount} phiếu${
          survey.closesOn ? ` · đóng sau ngày ${survey.closesOn.split("-").reverse().join("/")}` : ""
        }`}
        actions={
          <>
            <Badge tone={survey.acceptsResponses ? "success" : "neutral"} dot={survey.acceptsResponses}>
              {statusLabel}
            </Badge>
            <SurveyHeaderActions
              survey={{
                id: survey.id,
                title: survey.title,
                description: survey.description,
                audience: survey.audience,
                status: survey.status,
                closesOn: survey.closesOn,
                minGroupSize: survey.minGroupSize,
                responseCount
              }}
            />
          </>
        }
      />

      <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-stone-200 px-4 sm:mx-0 sm:px-0">
        {(
          [
            { key: "results", label: "Kết quả", count: responseCount, icon: Star },
            { key: "responses", label: "Từng phiếu", count: responseCount, icon: Inbox },
            { key: "questions", label: "Câu hỏi", count: survey.questions.length, icon: ListChecks },
            { key: "share", label: "Gửi link", count: survey.links.length, icon: Send }
          ] as const
        ).map((item) => (
          <Link
            key={item.key}
            href={tabHref(survey.id, item.key)}
            scroll={false}
            aria-current={tab === item.key ? "page" : undefined}
            className={clsx(
              "focus-ring -mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              tab === item.key
                ? "border-primary text-primary"
                : "border-transparent text-stone-500 hover:text-neutralText"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            <span className="rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">{item.count}</span>
          </Link>
        ))}
      </nav>

      {tab === "questions" ? (
        <QuestionEditor
          surveyId={survey.id}
          questions={survey.questions.map((q) => ({
            id: q.id,
            type: q.type,
            category: q.category,
            prompt: q.prompt,
            required: q.required,
            options: q.options
          }))}
          locked={responseCount > 0}
        />
      ) : null}

      {tab === "share" ? (
        <Panel>
          <SurveyLinksPanel
            surveyId={survey.id}
            surveyTitle={survey.title}
            audience={survey.audience}
            appUrl={settings.appUrl}
            acceptsResponses={survey.acceptsResponses}
            classes={activeClasses.map((c) => {
              const link = linkByClass.get(c.id);
              return {
                id: c.id,
                name: c.name,
                shortCode: c.shortCode,
                teacherName: c.teacherName,
                studentCount: studentCounts.get(c.id) ?? 0,
                responseCount: responsesByClass.get(c.id) ?? 0,
                path: link ? surveyPath(c.shortCode, link.token) : null
              };
            })}
          />
        </Panel>
      ) : null}

      {tab === "responses" ? (
        <ResponseList
          survey={survey}
          classFilter={classFilter}
          roleFilter={roleFilter}
          className={className}
          responsesByClass={responsesByClass}
          page={Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1)}
        />
      ) : null}

      {tab === "results" ? (
        <Results
          survey={survey}
          classFilter={classFilter}
          roleFilter={roleFilter}
          className={className}
          responsesByClass={responsesByClass}
          studentCounts={studentCounts}
          studentTotal={studentTotal}
        />
      ) : null}
    </div>
  );
}

type SurveyDetail = NonNullable<Awaited<ReturnType<typeof getSurveyDetail>>>;

function Results({
  survey,
  classFilter,
  roleFilter,
  className,
  responsesByClass,
  studentCounts,
  studentTotal
}: {
  survey: SurveyDetail;
  classFilter?: string;
  roleFilter?: SurveyRespondent;
  className: Map<string, string>;
  responsesByClass: Map<string, number>;
  studentCounts: Map<string, number>;
  studentTotal: number;
}) {
  const min = survey.minGroupSize;
  if (survey.responses.length === 0) {
    return (
      <EmptyState title="Chưa có phiếu trả lời" icon={<MessageSquareText className="h-6 w-6" />}>
        {survey.acceptsResponses
          ? "Gửi link ở tab Gửi link vào nhóm Zalo của từng lớp để bắt đầu nhận phiếu."
          : "Mở khảo sát rồi gửi link ở tab Gửi link vào nhóm Zalo của từng lớp."}
      </EmptyState>
    );
  }

  const filtered = survey.responses.filter(
    (r) => (!classFilter || r.classId === classFilter) && (!roleFilter || r.respondentRole === roleFilter)
  );
  const filters = (
    <ResponseFilters
      survey={survey}
      tab="results"
      classFilter={classFilter}
      roleFilter={roleFilter}
      className={className}
      responsesByClass={responsesByClass}
    />
  );
  const classesWithResponses = [...responsesByClass.keys()];

  if (!meetsThreshold(filtered.length, min)) {
    return (
      <div className="grid gap-4">
        {filters}
        <Panel className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm text-stone-600">
            <p className="font-semibold text-neutralText">Chưa đủ phiếu để hiện kết quả</p>
            <p className="mt-1">
              Nhóm này mới có {filtered.length} phiếu, cần ít nhất {min} phiếu. Kết quả nhóm nhỏ bị ẩn để không đoán ra ai đã
              trả lời gì. Có thể đổi ngưỡng ở “Sửa thông tin”.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const rating = overallRating(survey.questions, filtered);
  const npsQuestion = survey.questions.find((q) => q.type === "nps");
  const nps = npsQuestion ? summarizeNps(filtered.flatMap((r) => r.answers.filter((a) => a.questionId === npsQuestion.id && a.value !== null).map((a) => a.value as number))) : null;
  const categories = categoryAverages(survey.questions, filtered);
  const denominator = classFilter ? (studentCounts.get(classFilter) ?? 0) : studentTotal;

  return (
    <div className="grid gap-5">
      {filters}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <StatCard
          label="Số phiếu"
          value={filtered.length}
          hint={
            survey.audience !== "both" && !roleFilter && denominator > 0
              ? `${formatPercent(filtered.length, denominator)} của ${denominator} HS`
              : undefined
          }
          icon={<Users className="h-4 w-4" />}
          tone="primary"
        />
        <StatCard
          label="Điểm TB"
          value={rating === null ? "—" : `${formatScore(rating)}/5`}
          hint="Mọi câu chấm sao"
          icon={<Star className="h-4 w-4" />}
          tone={rating !== null && rating < 3 ? "warning" : "success"}
        />
        {nps ? (
          <StatCard
            label="Chỉ số giới thiệu"
            value={nps.score ?? "—"}
            hint={`${nps.promoters} ủng hộ · ${nps.detractors} chưa hài lòng`}
            icon={<ThumbsUp className="h-4 w-4" />}
            tone={(nps.score ?? 0) < 0 ? "warning" : "primary"}
          />
        ) : null}
        <StatCard
          label="Góp ý tự viết"
          value={filtered.reduce(
            (sum, r) => sum + r.answers.filter((a) => a.text && !a.hidden).length,
            0
          )}
          icon={<MessageSquareText className="h-4 w-4" />}
        />
      </div>

      {categories.length > 0 || (!classFilter && classesWithResponses.length > 1) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {categories.length > 0 ? (
            <Panel>
              <h2 className="font-semibold text-neutralText">Điểm theo nhóm đánh giá</h2>
              <div className="mt-4 grid gap-4">
                {categories.map((row) => (
                  <ScoreBar key={row.category} label={CATEGORY_LABEL[row.category]} score={row.average} hint={`${row.count} lượt chấm`} />
                ))}
              </div>
            </Panel>
          ) : null}
          {!classFilter && classesWithResponses.length > 1 ? (
            <ClassBreakdown
              survey={survey}
              responses={filtered}
              className={className}
              studentCounts={studentCounts}
              min={min}
            />
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4">
        {survey.questions.map((question, index) => (
          <QuestionResult
            key={question.id}
            index={index}
            question={question}
            responses={filtered}
            classLabel={(classId) =>
              !classFilter && classId && meetsThreshold(responsesByClass.get(classId) ?? 0, min) ? className.get(classId) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

function ResponseFilters({
  survey,
  tab,
  classFilter,
  roleFilter,
  className,
  responsesByClass
}: {
  survey: SurveyDetail;
  tab: Tab;
  classFilter?: string;
  roleFilter?: SurveyRespondent;
  className: Map<string, string>;
  responsesByClass: Map<string, number>;
}) {
  // Đổi bộ lọc thì về trang 1 của danh sách phiếu.
  const filterHref = (next: { class?: string; role?: string }) =>
    tabHref(survey.id, tab, { class: classFilter, role: roleFilter, ...next });
  const classesWithResponses = [...responsesByClass.entries()].sort((a, b) =>
    (className.get(a[0]) ?? "").localeCompare(className.get(b[0]) ?? "", "vi")
  );

  return (
    <div className="grid gap-2">
      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
        <Chip href={filterHref({ class: "" })} active={!classFilter}>
          Tất cả lớp
        </Chip>
        {classesWithResponses.map(([classId, count]) => (
          <Chip key={classId} href={filterHref({ class: classId })} active={classFilter === classId}>
            {className.get(classId) ?? "Lớp đã xóa"}
            <span className="opacity-60">{count}</span>
          </Chip>
        ))}
      </div>
      {survey.audience === "both" ? (
        <div className="flex flex-wrap gap-1.5">
          <Chip href={filterHref({ role: "" })} active={!roleFilter}>
            Mọi người trả lời
          </Chip>
          {(["student", "parent"] as const).map((role) => (
            <Chip key={role} href={filterHref({ role })} active={roleFilter === role}>
              {RESPONDENT_LABEL[role]}
            </Chip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatDay(iso: string) {
  return iso.split("-").reverse().join("/");
}

/** Xem lần lượt từng phiếu: mọi câu trả lời của một người nằm cùng một thẻ. */
function ResponseList({
  survey,
  classFilter,
  roleFilter,
  className,
  responsesByClass,
  page
}: {
  survey: SurveyDetail;
  classFilter?: string;
  roleFilter?: SurveyRespondent;
  className: Map<string, string>;
  responsesByClass: Map<string, number>;
  page: number;
}) {
  if (survey.responses.length === 0) {
    return (
      <EmptyState title="Chưa có phiếu trả lời" icon={<Inbox className="h-6 w-6" />}>
        Phiếu sẽ hiện ở đây ngay khi học sinh hoặc phụ huynh gửi.
      </EmptyState>
    );
  }

  // Mới nhất lên đầu; trong cùng ngày giữ thứ tự ngẫu nhiên của mã phiếu.
  const filtered = survey.responses
    .filter((r) => (!classFilter || r.classId === classFilter) && (!roleFilter || r.respondentRole === roleFilter))
    .sort((a, b) => b.submittedOn.localeCompare(a.submittedOn));
  const pageCount = Math.max(1, Math.ceil(filtered.length / RESPONSES_PER_PAGE));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * RESPONSES_PER_PAGE;
  const visible = filtered.slice(start, start + RESPONSES_PER_PAGE);
  const pageHref = (next: number) =>
    tabHref(survey.id, "responses", { class: classFilter, role: roleFilter, page: next > 1 ? String(next) : undefined });

  return (
    <div className="grid gap-4">
      <ResponseFilters
        survey={survey}
        tab="responses"
        classFilter={classFilter}
        roleFilter={roleFilter}
        className={className}
        responsesByClass={responsesByClass}
      />

      {filtered.length === 0 ? (
        <EmptyState title="Không có phiếu nào khớp bộ lọc" icon={<Inbox className="h-6 w-6" />}>
          Chọn lớp hoặc đối tượng khác.
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-stone-500">
            {filtered.length} phiếu{pageCount > 1 ? ` · đang xem ${start + 1}–${start + visible.length}` : ""}. Phiếu ẩn danh,
            chỉ biết lớp và ngày gửi.
          </p>
          <ResponseTable
            survey={survey}
            rows={visible.map((response, index) => ({
              response,
              number: filtered.length - start - index,
              classLabel: response.classId ? (className.get(response.classId) ?? "Lớp đã xóa") : "Lớp đã xóa"
            }))}
          />
          {pageCount > 1 ? (
            <nav className="flex items-center justify-center gap-2" aria-label="Trang danh sách phiếu">
              {current > 1 ? (
                <Link href={pageHref(current - 1)} scroll={false} className="focus-ring inline-flex h-9 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-600 hover:bg-stone-50">
                  <ChevronLeft className="h-4 w-4" />
                  Trước
                </Link>
              ) : null}
              <span className="px-2 text-sm tabular-nums text-stone-500">
                Trang {current}/{pageCount}
              </span>
              {current < pageCount ? (
                <Link href={pageHref(current + 1)} scroll={false} className="focus-ring inline-flex h-9 items-center gap-1 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-600 hover:bg-stone-50">
                  Sau
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : null}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * Bảng phiếu kiểu bảng tính: mỗi phiếu một hàng, mỗi câu một cột (C1, C2…), góp ý tự viết
 * gom ở cột cuối. Chú thích tên câu nằm trên bảng để tiêu đề cột gọn.
 */
function ResponseTable({
  survey,
  rows
}: {
  survey: SurveyDetail;
  rows: { response: SurveyDetail["responses"][number]; number: number; classLabel: string }[];
}) {
  const scored = survey.questions.filter((q) => q.type !== "text");
  const texts = survey.questions.filter((q) => q.type === "text");
  const code = new Map(survey.questions.map((q, index) => [q.id, `C${index + 1}`]));

  return (
    <Panel className="p-0">
      <details className="group border-b border-stone-100 px-4 py-3 text-xs text-stone-500">
        <summary className="cursor-pointer list-none font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
          <span className="group-open:hidden">Xem nội dung từng câu (C1–C{survey.questions.length}) ▾</span>
          <span className="hidden group-open:inline">Ẩn nội dung câu hỏi ▴</span>
        </summary>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {survey.questions.map((question) => (
            <li key={question.id}>
              <strong className="font-semibold text-neutralText">{code.get(question.id)}.</strong> {question.prompt}
            </li>
          ))}
        </ol>
      </details>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-stone-500">
            <tr className="border-b border-stone-100 bg-stone-50/70">
              <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2 font-semibold">Phiếu</th>
              <th className="px-3 py-2 font-semibold">Lớp · ngày</th>
              <th className="px-2 py-2 text-center font-semibold">TB</th>
              {scored.map((question) => (
                <th key={question.id} title={question.prompt} className="px-2 py-2 text-center font-semibold">
                  {code.get(question.id)}
                </th>
              ))}
              {texts.length > 0 ? <th className="min-w-[16rem] px-3 py-2 font-semibold">Góp ý</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ response, number, classLabel }) => {
              const answers = new Map(response.answers.map((answer) => [answer.questionId, answer]));
              const rating = overallRating(survey.questions, [response]);
              const comments = texts.flatMap((question) => {
                const answer = answers.get(question.id);
                return answer?.text ? [{ question, answer }] : [];
              });
              return (
                <tr key={response.id} className="align-top hover:bg-stone-50/60">
                  <td className="sticky left-0 z-10 bg-white px-3 py-2.5 font-semibold tabular-nums text-neutralText">#{number}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="block font-medium text-neutralText">{classLabel}</span>
                    <span className="text-xs text-stone-500">
                      {survey.audience === "both" ? `${RESPONDENT_LABEL[response.respondentRole]} · ` : ""}
                      {formatDay(response.submittedOn)}
                    </span>
                  </td>
                  <td className={clsx("px-2 py-2.5 text-center font-bold tabular-nums", scoreTone(rating).text)}>
                    {rating === null ? "—" : formatScore(rating)}
                  </td>
                  {scored.map((question) => (
                    <td key={question.id} className="px-2 py-2.5 text-center">
                      <AnswerCell question={question} answer={answers.get(question.id)} />
                    </td>
                  ))}
                  {texts.length > 0 ? (
                    <td className="px-3 py-2.5">
                      {comments.length === 0 ? (
                        <span className="text-stone-300">—</span>
                      ) : (
                        <ul className="grid gap-1.5">
                          {comments.map(({ question, answer }) => (
                            <li key={question.id} className="flex items-start gap-1.5">
                              <p
                                className={clsx(
                                  "min-w-0 flex-1 whitespace-pre-line break-words",
                                  answer.hidden ? "text-stone-400 line-through" : "text-stone-700"
                                )}
                              >
                                {texts.length > 1 ? (
                                  <span className="mr-1 text-xs font-semibold text-stone-400">{code.get(question.id)}</span>
                                ) : null}
                                {answer.text}
                              </p>
                              <CommentVisibilityButton responseId={response.id} questionId={question.id} hidden={answer.hidden} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Ô câu trả lời gọn: sao/NPS là số có màu, lựa chọn là chữ ngắn (đủ nội dung khi rê chuột). */
function AnswerCell({
  question,
  answer
}: {
  question: SurveyDetail["questions"][number];
  answer: SurveyDetail["responses"][number]["answers"][number] | undefined;
}) {
  const empty = <span className="text-stone-300">—</span>;
  if (!answer) return empty;

  if (question.type === "rating" || question.type === "nps") {
    if (answer.value === null) return empty;
    const value = answer.value;
    const tone =
      question.type === "rating"
        ? scoreTone(value).text
        : value >= 9
          ? "text-emerald-700"
          : value >= 7
            ? "text-stone-600"
            : "text-rose-700";
    return (
      <span className={clsx("inline-flex items-center gap-0.5 font-semibold tabular-nums", tone)}>
        {value}
        {question.type === "rating" ? <Star className="h-3 w-3 fill-current" /> : null}
      </span>
    );
  }

  const picked = answer.choices.map((choice) => question.options[choice]).filter(Boolean);
  if (picked.length === 0) return empty;
  const label = picked.join(", ");
  return (
    <span title={label} className="mx-auto block max-w-[9rem] truncate text-xs text-stone-700">
      {label}
    </span>
  );
}

function ClassBreakdown({
  survey,
  responses,
  className,
  studentCounts,
  min
}: {
  survey: SurveyDetail;
  responses: ResponseRow[];
  className: Map<string, string>;
  studentCounts: Map<string, number>;
  min: number;
}) {
  const groups = new Map<string, ResponseRow[]>();
  for (const response of responses) {
    if (!response.classId) continue;
    groups.set(response.classId, [...(groups.get(response.classId) ?? []), response]);
  }
  const rows = [...groups.entries()]
    .map(([classId, list]) => ({
      classId,
      teacherName: list[0]?.teacherName ?? "",
      count: list.length,
      visible: meetsThreshold(list.length, min),
      rating: overallRating(survey.questions, list)
    }))
    .sort((a, b) => (className.get(a.classId) ?? "").localeCompare(className.get(b.classId) ?? "", "vi"));

  return (
    <Panel className="p-0">
      <h2 className="px-5 pt-5 font-semibold text-neutralText">Theo lớp</h2>
      <p className="px-5 text-xs text-stone-500">Lớp dưới {min} phiếu bị ẩn điểm.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr className="border-y border-stone-100 bg-stone-50/60">
              <th className="px-5 py-2 font-semibold">Lớp</th>
              <th className="px-3 py-2 text-right font-semibold">Phiếu</th>
              <th className="px-5 py-2 text-right font-semibold">Điểm TB</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row) => (
              <tr key={row.classId}>
                <td className="px-5 py-2.5">
                  <Link
                    href={tabHref(survey.id, "results", { class: row.classId })}
                    scroll={false}
                    className="font-medium text-neutralText hover:text-primary"
                  >
                    {className.get(row.classId) ?? "Lớp đã xóa"}
                  </Link>
                  {row.teacherName ? <span className="block text-xs text-stone-500">{row.teacherName}</span> : null}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {row.count}
                  {survey.audience !== "both" && (studentCounts.get(row.classId) ?? 0) > 0 ? (
                    <span className="ml-1 text-xs text-stone-400">
                      {formatPercent(row.count, studentCounts.get(row.classId) ?? 0)}
                    </span>
                  ) : null}
                </td>
                <td className={clsx("px-5 py-2.5 text-right font-semibold tabular-nums", scoreTone(row.visible ? row.rating : null).text)}>
                  {row.visible ? formatScore(row.rating) : "Chưa đủ phiếu"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function QuestionResult({
  index,
  question,
  responses,
  classLabel
}: {
  index: number;
  question: SurveyDetail["questions"][number];
  responses: ResponseRow[];
  classLabel: (classId: string | null) => string | undefined;
}) {
  const summary = summarizeQuestion(question, responses);
  const answered =
    summary.kind === "choice"
      ? summary.respondents
      : summary.kind === "text"
        ? summary.comments.length
        : summary.count;

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-stone-400">
            Câu {index + 1} · {QUESTION_TYPE_LABEL[question.type]} · {CATEGORY_LABEL[question.category]}
          </p>
          <h3 className="mt-1 font-semibold text-neutralText">{question.prompt}</h3>
        </div>
        <span className="shrink-0 text-xs text-stone-500">{answered} trả lời</span>
      </div>

      {summary.kind === "rating" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
          <div>
            <p className={clsx("text-3xl font-bold tabular-nums", scoreTone(summary.average).text)}>
              {formatScore(summary.average)}
              <span className="text-base font-semibold text-stone-400">/5</span>
            </p>
            <p className="mt-1 flex gap-0.5" aria-hidden="true">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={clsx(
                    "h-4 w-4",
                    summary.average !== null && star <= Math.round(summary.average)
                      ? "fill-amber-400 text-amber-400"
                      : "text-stone-300"
                  )}
                />
              ))}
            </p>
          </div>
          <div className="grid gap-1.5">
            {[5, 4, 3, 2, 1].map((star) => (
              <CountBar key={star} label={`${star} sao`} count={summary.distribution[star - 1]} total={summary.count} />
            ))}
          </div>
        </div>
      ) : null}

      {summary.kind === "nps" ? (
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <p className="text-3xl font-bold tabular-nums text-neutralText">{summary.score ?? "—"}</p>
            <p className="text-sm text-stone-600">
              <span className="font-semibold text-emerald-700">{summary.promoters} ủng hộ (9–10)</span> ·{" "}
              <span className="font-semibold text-stone-600">{summary.passives} trung lập (7–8)</span> ·{" "}
              <span className="font-semibold text-rose-700">{summary.detractors} chưa hài lòng (0–6)</span>
            </p>
          </div>
          <div className="grid grid-cols-11 items-end gap-1" style={{ height: "96px" }}>
            {summary.distribution.map((count, value) => {
              const max = Math.max(1, ...summary.distribution);
              return (
                <div key={value} className="flex h-full flex-col items-center justify-end gap-1" title={`${value} điểm: ${count}`}>
                  <span className="text-[10px] tabular-nums text-stone-500">{count || ""}</span>
                  <div
                    className={clsx(
                      "w-full rounded-t",
                      value >= 9 ? "bg-emerald-500" : value >= 7 ? "bg-stone-300" : "bg-rose-400"
                    )}
                    style={{ height: `${(count / max) * 64}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-11 gap-1 text-center text-[11px] text-stone-500">
            {summary.distribution.map((_, value) => (
              <span key={value}>{value}</span>
            ))}
          </div>
          <p className="text-xs text-stone-500">
            Chỉ số = % ủng hộ − % chưa hài lòng, từ −100 đến 100. Trên 0 là tốt, trên 50 là rất tốt.
          </p>
        </div>
      ) : null}

      {summary.kind === "choice" ? (
        <div className="mt-4 grid gap-1.5">
          {question.options.map((option, optionIndex) => (
            <CountBar key={option} label={option} count={summary.counts[optionIndex] ?? 0} total={summary.respondents} />
          ))}
          {question.type === "multi" ? <p className="mt-1 text-xs text-stone-500">Được chọn nhiều đáp án nên tổng có thể vượt 100%.</p> : null}
        </div>
      ) : null}

      {summary.kind === "text" ? <Comments question={question} comments={summary.comments} classLabel={classLabel} /> : null}
    </Panel>
  );
}

function Comments({
  question,
  comments,
  classLabel
}: {
  question: { id: string };
  comments: { responseId: string; classId: string | null; text: string; hidden: boolean }[];
  classLabel: (classId: string | null) => string | undefined;
}) {
  const visible = comments.filter((c) => !c.hidden);
  const hidden = comments.filter((c) => c.hidden);
  if (comments.length === 0) return <p className="mt-3 text-sm text-stone-500">Chưa có góp ý.</p>;

  return (
    <div className="mt-4 grid gap-2">
      <ul className="grid max-h-[480px] gap-2 overflow-y-auto pr-1">
        {visible.map((comment) => {
          const label = classLabel(comment.classId);
          return (
            <li key={comment.responseId} className="flex items-start gap-2 rounded-xl bg-stone-50 px-3.5 py-2.5">
              <p className="min-w-0 flex-1 whitespace-pre-line break-words text-sm text-stone-700">
                {comment.text}
                {label ? <span className="ml-2 whitespace-nowrap text-xs text-stone-400">— {label}</span> : null}
              </p>
              <CommentVisibilityButton responseId={comment.responseId} questionId={question.id} hidden={false} />
            </li>
          );
        })}
      </ul>
      {hidden.length > 0 ? (
        <details className="group rounded-xl border border-dashed border-stone-200 px-3.5 py-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-stone-500 [&::-webkit-details-marker]:hidden">
            <EyeOff className="h-3.5 w-3.5" />
            {hidden.length} góp ý đã ẩn
          </summary>
          <ul className="mt-2 grid gap-2">
            {hidden.map((comment) => (
              <li key={comment.responseId} className="flex items-start gap-2 text-sm text-stone-400">
                <p className="min-w-0 flex-1 whitespace-pre-line break-words line-through">{comment.text}</p>
                <CommentVisibilityButton responseId={comment.responseId} questionId={question.id} hidden />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
