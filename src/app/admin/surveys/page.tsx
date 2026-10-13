import Link from "next/link";
import { ChevronRight, ClipboardList, Inbox, MessageSquareHeart, Star, ThumbsUp } from "lucide-react";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { CreateSurveyButton } from "@/components/surveys/CreateSurveyButton";
import { ScoreBar, scoreTone } from "@/components/surveys/ScoreBar";
import { requireAdmin } from "@/lib/auth";
import { formatDayMonth } from "@/lib/format";
import {
  AUDIENCE_LABEL,
  CATEGORY_LABEL,
  DEFAULT_MIN_GROUP_SIZE,
  formatPercent,
  formatScore,
  meetsThreshold,
  STATUS_LABEL
} from "@/lib/survey-core";
import { getSurveyOverview } from "@/lib/surveys";

export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "neutral", open: "success", closed: "primary" } as const;

export default async function SurveysPage() {
  // Chỉ chủ trung tâm: quản lý phụ và giáo viên không xem được góp ý (xem canAccessAdminPath).
  await requireAdmin();
  const { items, totals, categories, teachers } = await getSurveyOverview();

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Khảo sát"
        description="Góp ý ẩn danh của học sinh và phụ huynh qua link từng lớp. Chỉ chủ trung tâm xem được."
        actions={<CreateSurveyButton />}
      />

      {items.length === 0 ? (
        <EmptyState title="Chưa có khảo sát nào" icon={<ClipboardList className="h-6 w-6" />}>
          Tạo khảo sát từ mẫu có sẵn (cơ sở vật chất, giáo viên, chương trình, mức độ hài lòng), rồi gửi link vào nhóm Zalo
          của từng lớp.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
            <StatCard
              label="Đang nhận phiếu"
              value={totals.openCount}
              hint={`/${items.length} khảo sát`}
              icon={<Inbox className="h-4 w-4" />}
              tone="primary"
            />
            <StatCard
              label="Phiếu 30 ngày qua"
              value={totals.recentResponseCount}
              hint={`Tổng ${totals.responseCount} phiếu`}
              icon={<MessageSquareHeart className="h-4 w-4" />}
            />
            <StatCard
              label="Điểm hài lòng TB"
              value={totals.rating === null ? "—" : `${formatScore(totals.rating)}/5`}
              hint="Mọi câu chấm sao"
              icon={<Star className="h-4 w-4" />}
              tone={totals.rating !== null && totals.rating < 3 ? "warning" : "success"}
            />
            <StatCard
              label="Chỉ số giới thiệu"
              value={totals.latestNps?.score ?? "—"}
              hint={totals.latestNps ? totals.latestNps.title : "Chưa có câu 0–10"}
              icon={<ThumbsUp className="h-4 w-4" />}
              tone={totals.latestNps && (totals.latestNps.score ?? 0) < 0 ? "warning" : "primary"}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel>
              <h2 className="font-semibold text-neutralText">Điểm theo nhóm đánh giá</h2>
              <p className="mt-0.5 text-xs text-stone-500">Trung bình câu chấm sao của mọi đợt khảo sát, thang 5.</p>
              <div className="mt-4 grid gap-4">
                {categories.length === 0 ? (
                  <p className="text-sm text-stone-500">Chưa có phiếu chấm sao.</p>
                ) : (
                  categories.map((row) => (
                    <ScoreBar
                      key={row.category}
                      label={CATEGORY_LABEL[row.category]}
                      score={row.average}
                      hint={`${row.count} lượt chấm`}
                    />
                  ))
                )}
              </div>
            </Panel>
            <Panel>
              <h2 className="font-semibold text-neutralText">Điểm giáo viên</h2>
              <p className="mt-0.5 text-xs text-stone-500">
                Câu nhóm “Giáo viên”, gắn theo giáo viên của lớp nhận link. Cần từ {DEFAULT_MIN_GROUP_SIZE} phiếu mới hiện điểm.
              </p>
              <div className="mt-4 grid gap-4">
                {teachers.length === 0 ? (
                  <p className="text-sm text-stone-500">Chưa có phiếu đánh giá giáo viên.</p>
                ) : (
                  teachers.map((row) => (
                    <ScoreBar
                      key={row.name}
                      label={row.name}
                      score={row.average}
                      muted={!row.visible}
                      hint={row.visible ? `${row.responseCount} phiếu` : `Mới có ${row.responseCount} phiếu, chưa đủ để hiện điểm`}
                    />
                  ))
                )}
              </div>
            </Panel>
          </div>

          <Panel className="p-0">
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
              <h2 className="font-semibold text-neutralText">Tất cả khảo sát</h2>
              <span className="text-xs text-stone-500">{items.length} khảo sát</span>
            </div>
            <ul className="divide-y divide-stone-100">
              {items.map((item) => {
                const enough = meetsThreshold(item.responseCount, item.minGroupSize);
                return (
                <li key={item.id}>
                  <Link
                    href={`/admin/surveys/${item.id}`}
                    className="focus-ring group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-stone-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-neutralText">{item.title}</p>
                        <Badge tone={item.acceptsResponses ? "success" : STATUS_TONE[item.status]} dot={item.acceptsResponses}>
                          {item.status === "open" && !item.acceptsResponses ? "Hết hạn" : STATUS_LABEL[item.status]}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">
                        {AUDIENCE_LABEL[item.audience]} · {item.classCount} lớp · {item.questionCount} câu · tạo{" "}
                        {formatDayMonth(item.createdAt)}
                        {item.closesOn ? ` · đóng ${item.closesOn.slice(8, 10)}/${item.closesOn.slice(5, 7)}` : ""}
                      </p>
                    </div>
                    <dl className="hidden shrink-0 grid-cols-3 gap-6 text-right sm:grid">
                      <div>
                        <dt className="text-xs text-stone-500">Phiếu</dt>
                        <dd className="font-semibold tabular-nums text-neutralText">
                          {item.responseCount}
                          {item.audience !== "both" && item.studentCount > 0 ? (
                            <span className="ml-1 text-xs font-normal text-stone-400">
                              {formatPercent(item.responseCount, item.studentCount)}
                            </span>
                          ) : null}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-stone-500">Điểm TB</dt>
                        <dd className={`font-semibold tabular-nums ${scoreTone(enough ? item.rating : null).text}`}>
                          {enough ? formatScore(item.rating) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-stone-500">Giới thiệu</dt>
                        <dd className="font-semibold tabular-nums text-neutralText">{enough ? (item.nps ?? "—") : "—"}</dd>
                      </div>
                    </dl>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-neutralText sm:hidden">
                      {item.responseCount} phiếu
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-stone-300 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
                );
              })}
            </ul>
          </Panel>
        </>
      )}
    </div>
  );
}
