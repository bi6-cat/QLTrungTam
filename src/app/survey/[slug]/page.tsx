import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { SurveyForm } from "@/components/surveys/SurveyForm";
import { resolveSurveyLink, surveyAcceptsResponses } from "@/lib/surveys";
import { displayFont } from "../../fonts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Khảo sát ẩn danh",
  robots: { index: false, follow: false }
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${displayFont.variable} min-h-screen bg-ivory text-ink`}>
      <header className="border-b border-ink/5">
        <div className="mx-auto flex h-14 max-w-2xl items-center gap-2.5 px-4">
          <img src="/logo.jpg" alt="APLUS ACADEMY" className="h-8 w-8 rounded-full border border-ink/10 bg-white object-cover" />
          <span className="text-sm font-semibold tracking-[0.08em]">APLUS ACADEMY</span>
        </div>
      </header>
      <main className="mx-auto grid max-w-2xl gap-6 px-4 py-8 sm:py-12">{children}</main>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-8 text-center sm:p-12">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ivory text-ink">{icon}</span>
      <h1 className="mt-5 font-display text-3xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm leading-relaxed text-ink-muted">{children}</p>
    </div>
  );
}

export default async function SurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await resolveSurveyLink(slug);
  if (!link) notFound();
  const { survey, classRoom } = link;

  if (!surveyAcceptsResponses(survey) || classRoom.archivedAt) {
    return (
      <Shell>
        <Notice icon={<Clock className="h-6 w-6" />} title={survey.status === "draft" ? "Khảo sát chưa mở" : "Khảo sát đã đóng"}>
          {survey.status === "draft"
            ? "Trung tâm sẽ thông báo khi khảo sát bắt đầu nhận phiếu."
            : "Cảm ơn bạn đã quan tâm. Khảo sát này không còn nhận phiếu."}
        </Notice>
      </Shell>
    );
  }

  // Khảo sát chỉ một đối tượng: máy đã gửi phiếu thì cảm ơn luôn. Khảo sát cho cả học sinh lẫn
  // phụ huynh vẫn hiện form vì hai người có thể dùng chung máy (server chặn trùng theo vai trò).
  const cookieStore = await cookies();
  if (survey.audience !== "both" && cookieStore.get(`survey_done_${survey.id}_${survey.audience}`)) {
    return (
      <Shell>
        <Notice icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />} title="Bạn đã gửi phiếu rồi">
          Cảm ơn bạn đã góp ý cho {survey.title.toLowerCase()}. Mỗi người chỉ cần gửi một phiếu.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-dark">
          Khảo sát · {classRoom.name}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-tight tracking-tight sm:text-5xl">{survey.title}</h1>
        {survey.description ? <p className="mt-4 leading-relaxed text-ink-muted">{survey.description}</p> : null}
        <div className="mt-6 flex items-start gap-3 rounded-2xl bg-ink p-4 text-sm text-white/85 sm:p-5">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brass-light" />
          <p>
            <strong className="font-semibold text-white">Phiếu hoàn toàn ẩn danh.</strong> Không cần ghi tên, trung tâm chỉ
            biết phiếu đến từ lớp nào, không biết ai đã trả lời. Hãy góp ý thật lòng nhé!
          </p>
        </div>
      </section>
      <SurveyForm
        slug={slug}
        audience={survey.audience}
        questions={survey.questions.map((q) => ({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          required: q.required,
          options: q.options
        }))}
      />
    </Shell>
  );
}
