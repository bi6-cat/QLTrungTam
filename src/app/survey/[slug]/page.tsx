import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { SurveyForm } from "@/components/surveys/SurveyForm";
import { CENTER_INFO } from "@/lib/center";
import { resolveSurveyLink, surveyAcceptsResponses } from "@/lib/surveys";
import { publicFont } from "../../fonts";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Khảo sát ẩn danh",
  robots: { index: false, follow: false }
};

const focus =
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-white";

// Cùng font, màu và đầu trang với trang chủ; logo + tên trung tâm dẫn về trang chủ.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${publicFont.variable} flex min-h-screen flex-col bg-canvas font-display text-ink`}>
      <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Link href="/" className={`${focus} flex min-w-0 items-center gap-2.5 rounded-lg`}>
            <img src="/logo.jpg" alt="" className="h-8 w-8 shrink-0 rounded-full border border-slate-200 bg-white object-cover" />
            <span className="truncate text-[15px] font-extrabold tracking-tight text-brand-deep">
              APLUS <span className="text-brand">ACADEMY</span>
            </span>
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            Ẩn danh
          </span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-2xl flex-1 content-start gap-5 px-4 py-6 sm:py-10">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-col gap-1 px-4 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} APLUS ACADEMY · {CENTER_INFO.phone}</p>
          <Link href="/" className={`${focus} w-fit rounded font-medium text-brand hover:underline`}>
            Về trang chủ
          </Link>
        </div>
      </footer>
    </div>
  );
}

function Notice({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-soft sm:p-12">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand">{icon}</span>
      <h1 className="mt-5 text-2xl font-bold">{title}</h1>
      <p className="mx-auto mt-3 max-w-sm leading-relaxed text-ink-muted">{children}</p>
      <Link
        href="/"
        className={`${focus} mt-6 inline-flex h-11 items-center rounded-full border border-slate-200 px-5 text-sm font-semibold text-ink hover:border-brand/40 hover:text-brand`}
      >
        Về trang chủ
      </Link>
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
        <Notice icon={<CheckCircle2 className="h-6 w-6" />} title="Bạn đã gửi phiếu rồi">
          Cảm ơn bạn đã góp ý cho {survey.title.toLowerCase()}. Mỗi người chỉ cần gửi một phiếu.
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="animate-fade-up relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-indigo-500 px-5 py-5 text-white sm:px-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 bg-[radial-gradient(closest-side,rgba(251,191,36,0.3),transparent)]"
        />
        <p className="relative text-xs font-semibold text-white/75">Khảo sát · {classRoom.name}</p>
        <h1 className="relative mt-1 text-xl font-extrabold leading-snug tracking-tight sm:text-2xl">{survey.title}</h1>
        {survey.description ? (
          <p className="relative mt-1.5 whitespace-pre-line text-sm leading-relaxed text-white/85">{survey.description}</p>
        ) : null}
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
