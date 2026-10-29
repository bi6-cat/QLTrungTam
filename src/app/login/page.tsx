import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, CalendarDays, QrCode, ShieldCheck } from "lucide-react";
import { clsx } from "clsx";
import { LoginForm } from "@/components/LoginForm";
import { StudentLoginForm, TeacherLoginForm } from "@/components/PortalLoginForms";
import { getCurrentStudent, getCurrentTeacher, PORTAL_HOME } from "@/modules/identity";

const FEATURES = [
  { icon: BookOpenCheck, title: "Lớp học & học sinh", text: "Danh sách lớp, ghi danh, bảo lưu theo từng tháng." },
  { icon: CalendarDays, title: "Thời khóa biểu", text: "Điểm danh buổi học, buổi nghỉ và học bù." },
  { icon: QrCode, title: "Học phí QR", text: "Phát hành hóa đơn, đối soát chuyển khoản tự động." }
];

/** Hình trang trí: vòng cung cam như nét vút trong logo + vài ngôi sao nhỏ. */
function Decoration() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="login-arc" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id="login-glow" cx="0.8" cy="0.15" r="0.6">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </radialGradient>
        <pattern id="login-dots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#ffffff" fillOpacity="0.08" />
        </pattern>
      </defs>
      <rect width="600" height="800" fill="url(#login-glow)" />
      <rect width="600" height="800" fill="url(#login-dots)" />
      <path d="M 180 860 C 330 700, 480 620, 700 590" fill="none" stroke="url(#login-arc)" strokeWidth="20" strokeLinecap="round" opacity="0.9" />
      <path d="M 120 880 C 300 690, 470 600, 700 560" fill="none" stroke="#ffffff" strokeOpacity="0.08" strokeWidth="2" />
      <circle cx="520" cy="140" r="150" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.5" />
      <circle cx="520" cy="140" r="90" fill="none" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.5" />
      {[
        { x: 520, y: 120, s: 14, c: "#fbbf24" },
        { x: 470, y: 175, s: 8, c: "#ffffff" },
        { x: 560, y: 520, s: 10, c: "#fb923c" }
      ].map((star) => (
        <path
          key={`${star.x}-${star.y}`}
          d={`M ${star.x} ${star.y - star.s} Q ${star.x} ${star.y} ${star.x + star.s} ${star.y} Q ${star.x} ${star.y} ${star.x} ${star.y + star.s} Q ${star.x} ${star.y} ${star.x - star.s} ${star.y} Q ${star.x} ${star.y} ${star.x} ${star.y - star.s} Z`}
          fill={star.c}
          fillOpacity="0.85"
        />
      ))}
    </svg>
  );
}

type Audience = "admin" | "teacher" | "student";

const AUDIENCES: Record<Audience, { tab: string; title: string; hint: string; footer: string }> = {
  admin: {
    tab: "Quản lý",
    title: "Chào mừng trở lại",
    hint: "Đăng nhập bằng tài khoản quản trị được cấp.",
    footer: "Kết nối bảo mật · chỉ dành cho quản trị viên"
  },
  teacher: {
    tab: "Giáo viên",
    title: "Chào thầy cô",
    hint: "Đăng nhập bằng tài khoản giáo viên trung tâm cấp.",
    footer: "Kết nối bảo mật · tài khoản giáo viên"
  },
  student: {
    tab: "Học sinh",
    title: "Chào em",
    hint: "Nhập mã học sinh và mã PIN trên phiếu trung tâm phát.",
    footer: "Quên mã PIN? Nhờ thầy cô hoặc trung tâm cấp lại."
  }
};

function parseAudience(value: string | string[] | undefined): Audience {
  return value === "teacher" || value === "student" ? value : "admin";
}

function AudienceTabs({ active }: { active: Audience }) {
  return (
    <nav aria-label="Đăng nhập với vai trò" className="grid grid-cols-3 gap-1 rounded-2xl bg-stone-100 p-1">
      {(Object.keys(AUDIENCES) as Audience[]).map((audience) => (
        <Link
          key={audience}
          href={audience === "admin" ? "/login" : `/login?as=${audience}`}
          aria-current={audience === active ? "page" : undefined}
          className={clsx(
            "rounded-xl px-2 py-2 text-center text-sm font-semibold transition",
            audience === active ? "bg-white text-neutralText shadow-sm" : "text-stone-500 hover:text-neutralText"
          )}
        >
          {AUDIENCES[audience].tab}
        </Link>
      ))}
    </nav>
  );
}

function LogoCard({ className = "" }: { className?: string }) {
  // logo.jpg nền trắng, nhiều lề: đặt trong thẻ trắng và phóng to để cắt bớt lề.
  return (
    <div className={`overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-black/5 ${className}`}>
      <img src="/logo.jpg" alt="APLUS ACADEMY" className="h-full w-full scale-[1.2] object-cover" />
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ as?: string | string[] }> }) {
  const audience = parseAudience((await searchParams).as);
  // Đã đăng nhập cổng này rồi thì vào thẳng (vd bấm lại link đăng nhập trên điện thoại).
  if (audience === "teacher" && (await getCurrentTeacher())) redirect(PORTAL_HOME.teacher);
  if (audience === "student" && (await getCurrentStudent())) redirect(PORTAL_HOME.student);
  const copy = AUDIENCES[audience];
  const year = new Date().getFullYear();
  return (
    <main className="grid min-h-screen bg-stone-50 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Cột thương hiệu (màn hình rộng). */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#0b1d4d] via-[#1e2a78] to-primary text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Decoration />

        <div className="relative flex items-center gap-4">
          <LogoCard className="h-14 w-24" />
          <div>
            <p className="text-sm font-bold tracking-[0.2em]">APLUS ACADEMY</p>
            <p className="text-xs text-indigo-200">Hệ thống quản lý trung tâm</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-inset ring-white/15">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Học tập hôm nay – Vững bước tương lai
          </p>
          <h2 className="mt-5 text-4xl font-bold leading-tight tracking-tight">
            Quản lý lớp học và học phí <span className="text-amber-300">gọn gàng</span>, rõ ràng mỗi tháng.
          </h2>
          <ul className="mt-8 grid gap-4">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-inset ring-white/15">
                  <feature.icon className="h-5 w-5 text-amber-300" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{feature.title}</span>
                  <span className="block text-sm text-indigo-200">{feature.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-indigo-300">© {year} APLUS ACADEMY</p>
      </aside>

      {/* Cột đăng nhập. */}
      <section className="relative flex flex-col">
        {/* Dải thương hiệu trên điện thoại. */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0b1d4d] to-primary px-6 pb-16 pt-8 text-white lg:hidden">
          <Decoration />
          <div className="relative flex items-center gap-3">
            <LogoCard className="h-12 w-20" />
            <div>
              <p className="text-sm font-bold tracking-[0.2em]">APLUS ACADEMY</p>
              <p className="text-xs text-indigo-200">Học tập hôm nay – Vững bước tương lai</p>
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-start justify-center px-4 lg:items-center lg:px-12">
          <div className="-mt-10 w-full max-w-md animate-scale-in rounded-3xl border border-stone-200/80 bg-white p-7 shadow-lift sm:p-9 lg:mt-0">
            <LogoCard className="mx-auto hidden h-16 w-28 lg:block" />
            <div className="lg:mt-6">
              <AudienceTabs active={audience} />
            </div>
            <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-neutralText">{copy.title}</h1>
            <p className="mt-1.5 text-center text-sm text-stone-500">{copy.hint}</p>
            <div className="mt-7">
              {audience === "teacher" ? <TeacherLoginForm /> : audience === "student" ? <StudentLoginForm /> : <LoginForm />}
            </div>
            <p className="mt-7 flex items-center justify-center gap-1.5 border-t border-stone-100 pt-5 text-xs text-stone-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              {copy.footer}
            </p>
          </div>
        </div>

        <p className="py-6 text-center text-xs text-stone-400 lg:hidden">© {year} APLUS ACADEMY</p>
      </section>
    </main>
  );
}
