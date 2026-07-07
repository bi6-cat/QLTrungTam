import Link from "next/link";
import {
  Atom,
  BookOpen,
  Calculator,
  CheckCircle2,
  Clock,
  Dna,
  Facebook,
  FlaskConical,
  GraduationCap,
  Globe2,
  Landmark,
  Languages,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Sparkles,
  Target,
  Users
} from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { CENTER_INFO } from "@/lib/center";

/**
 * Thông tin liên hệ hiển thị công khai trên landing page.
 * 👉 Sửa ở @/lib/center.ts để đồng bộ với báo cáo Excel.
 */
const CONTACT = {
  phone: CENTER_INFO.phone,
  address: CENTER_INFO.address,
  hours: "7h00 – 23h00, tất cả các ngày trong tuần",
  facebookUrl: "https://www.facebook.com/apeduvn/",
  facebookLabel: "Luyện thi & bổ trợ kiến thức A+ Academy",
  email: CENTER_INFO.email
};

/**
 * Hồ sơ giáo viên — mô tả & ảnh chân dung hiển thị ở phần "Đội ngũ giáo viên".
 * 👉 Key phải TRÙNG tên giáo viên khai trong hệ thống lớp (VD "Thầy Minh", "Cô Lan").
 * 👉 Ảnh: đặt file vào thư mục /public (VD public/teachers/thay-minh.jpg) rồi ghi
 *    đường dẫn "/teachers/thay-minh.jpg". Bỏ trống `photo` sẽ dùng avatar chữ.
 */
const TEACHER_PROFILES: Record<string, { bio?: string; photo?: string }> = {
  "Cô Hương": { bio: "Trên 5 năm kinh nghiệm giảng dạy Ngữ văn.", photo: "" },
  "Cô Lệ": { bio: "10 năm kinh nghiệm giảng dạy Tiếng Anh.", photo: "" },
  "Cô Hằng": { bio: "Trên 5 năm kinh nghiệm giảng dạy Toán.", photo: "" },
  "Thầy Thắng": { bio: "10 năm kinh nghiệm giảng dạy Tiếng Anh.", photo: "" },
  "Cô Hoan": { bio: "Trên 5 năm kinh nghiệm giảng dạy Lịch sử.", photo: "" }
};

/**
 * Danh sách khóa học đang mở tại trung tâm.
 * 👉 Sửa trực tiếp ở đây khi có lớp mới, đổi giáo viên hoặc học phí.
 */
const COURSES = [
  { name: "Ngữ văn 9", teacherName: "Cô Hương", pricePerSession: 40000, sessionsPerMonthDefault: 8 },
  { name: "Tiếng Anh 9", teacherName: "Cô Lệ", pricePerSession: 40000, sessionsPerMonthDefault: 8 },
  { name: "Toán 12", teacherName: "Cô Hằng", pricePerSession: 50000, sessionsPerMonthDefault: 8 },
  { name: "Tiếng Anh 10", teacherName: "Thầy Thắng", pricePerSession: 40000, sessionsPerMonthDefault: 8 },
  { name: "Lịch sử 12", teacherName: "Cô Hoan", pricePerSession: 50000, sessionsPerMonthDefault: 8 }
] as const;

// Các môn / khối lớp trung tâm đang giảng dạy (dùng cho lưới "Môn học").
const SUBJECTS = [
  { name: "Toán", icon: Calculator, tone: "from-indigo-500 to-primary" },
  { name: "Vật lý", icon: Atom, tone: "from-sky-500 to-blue-600" },
  { name: "Hóa học", icon: FlaskConical, tone: "from-emerald-500 to-teal-600" },
  { name: "Ngữ văn", icon: BookOpen, tone: "from-rose-500 to-pink-600" },
  { name: "Tiếng Anh", icon: Languages, tone: "from-violet-500 to-purple-600" },
  { name: "Sinh học", icon: Dna, tone: "from-lime-500 to-green-600" },
  { name: "Lịch sử", icon: Landmark, tone: "from-amber-500 to-orange-600" },
  { name: "Địa lý", icon: Globe2, tone: "from-cyan-500 to-teal-600" }
] as const;

// Suy ra icon + màu cho thẻ khóa học từ tên lớp (VD "Toán 9", "Hóa 11"…).
function inferCourseStyle(name: string) {
  const n = name.toLowerCase();
  const match = (...keys: string[]) => keys.some((k) => n.includes(k));
  if (match("toán")) return { icon: Calculator, tone: "from-indigo-500 to-primary", chip: "bg-indigo-50 text-primary" };
  if (match("lý", "vật lý")) return { icon: Atom, tone: "from-sky-500 to-blue-600", chip: "bg-sky-50 text-sky-700" };
  if (match("hóa")) return { icon: FlaskConical, tone: "from-emerald-500 to-teal-600", chip: "bg-emerald-50 text-emerald-700" };
  if (match("văn")) return { icon: BookOpen, tone: "from-rose-500 to-pink-600", chip: "bg-rose-50 text-rose-700" };
  if (match("anh", "english")) return { icon: Languages, tone: "from-violet-500 to-purple-600", chip: "bg-violet-50 text-violet-700" };
  if (match("sinh")) return { icon: Dna, tone: "from-lime-500 to-green-600", chip: "bg-lime-50 text-lime-700" };
  if (match("sử")) return { icon: Landmark, tone: "from-amber-500 to-orange-600", chip: "bg-amber-50 text-amber-700" };
  if (match("địa")) return { icon: Globe2, tone: "from-cyan-500 to-teal-600", chip: "bg-cyan-50 text-cyan-700" };
  return { icon: GraduationCap, tone: "from-stone-500 to-stone-700", chip: "bg-stone-100 text-stone-700" };
}

// Tên môn hiển thị suy ra từ tên lớp (để gom môn dạy cho mỗi giáo viên).
function inferSubjectName(name: string) {
  const n = name.toLowerCase();
  if (n.includes("toán")) return "Toán";
  if (n.includes("vật lý") || /\blý\b/.test(n)) return "Vật lý";
  if (n.includes("hóa")) return "Hóa học";
  if (n.includes("văn")) return "Ngữ văn";
  if (n.includes("anh") || n.includes("english")) return "Tiếng Anh";
  if (n.includes("sinh")) return "Sinh học";
  if (n.includes("sử")) return "Lịch sử";
  if (n.includes("địa")) return "Địa lý";
  return null;
}

// Bỏ kính ngữ đầu tên nếu có (tên GV trong DB thường là "Thầy Minh", "Cô Lan").
function stripHonorific(fullName: string) {
  return fullName.trim().replace(/^(thầy|thày|cô|cô giáo|thầy giáo)\s+/i, "").trim();
}

// Nhãn hiển thị: giữ nguyên nếu đã có kính ngữ, nếu chưa thì thêm "Thầy/Cô".
function teacherLabel(fullName: string) {
  const t = fullName.trim();
  return /^(thầy|thày|cô)(\s|$)/i.test(t) ? t : `Thầy/Cô ${t}`;
}

// Chữ cái đầu của tên giáo viên (dùng cho avatar chữ), bỏ kính ngữ.
function initials(fullName: string) {
  const parts = stripHonorific(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GV";
  const last = parts[parts.length - 1];
  const first = parts.length > 1 ? parts[0] : parts[0];
  return (first[0] + (parts.length > 1 ? last[0] : "")).toUpperCase();
}

const AVATAR_TONES = [
  "from-indigo-500 to-primary",
  "from-sky-500 to-blue-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600"
] as const;

const REASONS = [
  {
    icon: GraduationCap,
    title: "Giáo viên tận tâm, kinh nghiệm",
    desc: "Đội ngũ giáo viên bám sát chương trình cấp 2 & cấp 3, chữa bài kỹ, quan tâm từng học sinh.",
    chip: "bg-indigo-50 text-primary"
  },
  {
    icon: Users,
    title: "Lớp sĩ số nhỏ",
    desc: "Giới hạn số lượng mỗi lớp để thầy cô kèm sát, học sinh được hỏi bài và luyện tập nhiều hơn.",
    chip: "bg-emerald-50 text-success"
  },
  {
    icon: Target,
    title: "Lộ trình theo mục tiêu",
    desc: "Từ củng cố kiến thức nền đến luyện thi vào 10 và THPT Quốc gia, có lộ trình rõ ràng theo từng khối.",
    chip: "bg-amber-50 text-accent"
  },
  {
    icon: MessageCircle,
    title: "Đồng hành cùng phụ huynh",
    desc: "Phản hồi tình hình học tập thường xuyên, minh bạch học phí và lịch học qua hệ thống trực tuyến.",
    chip: "bg-rose-50 text-rose-600"
  }
] as const;

export default function LandingPage() {
  const classCount = COURSES.length;
  const teacherCount = new Set(COURSES.map((c) => c.teacherName)).size;

  // Đội ngũ giáo viên: gom theo teacherName, tổng hợp môn dạy + số lớp.
  const teacherMap = new Map<string, { name: string; subjects: Set<string>; classes: number }>();
  for (const c of COURSES) {
    const entry = teacherMap.get(c.teacherName) ?? { name: c.teacherName, subjects: new Set<string>(), classes: 0 };
    const subject = inferSubjectName(c.name);
    if (subject) entry.subjects.add(subject);
    entry.classes += 1;
    teacherMap.set(c.teacherName, entry);
  }
  const teachers = [...teacherMap.values()].sort((a, b) => b.classes - a.classes);

  return (
    <div className="min-h-screen">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="focus-ring flex items-center gap-3 rounded-xl">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-10 w-10 rounded-xl border border-stone-200 bg-white object-cover shadow-sm"
            />
            <div className="leading-tight">
              <p className="text-sm font-extrabold tracking-tight text-primary">APLUS ACADEMY</p>
              <p className="text-xs text-stone-500">Dạy thêm cấp 2 &amp; cấp 3</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-semibold text-stone-600 md:flex">
            <a className="focus-ring rounded-lg px-3 py-2 hover:bg-stone-100 hover:text-primary" href="#courses">
              Khóa học
            </a>
            <a className="focus-ring rounded-lg px-3 py-2 hover:bg-stone-100 hover:text-primary" href="#subjects">
              Môn học
            </a>
            <a className="focus-ring rounded-lg px-3 py-2 hover:bg-stone-100 hover:text-primary" href="#teachers">
              Đội ngũ GV
            </a>
            <a className="focus-ring rounded-lg px-3 py-2 hover:bg-stone-100 hover:text-primary" href="#why">
              Vì sao chọn
            </a>
            <a className="focus-ring rounded-lg px-3 py-2 hover:bg-stone-100 hover:text-primary" href="#contact">
              Liên hệ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/admin"
              className="focus-ring hidden h-11 items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold text-neutralText shadow-sm hover:border-stone-400 hover:bg-stone-50 sm:inline-flex"
            >
              <Shield className="h-4 w-4" />
              Trang quản trị
            </Link>
            <a href="#contact">
              <Button variant="accent">Đăng ký học</Button>
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-grid opacity-[0.35]" />
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-2 md:py-24">
            <div className="animate-fade-up">
              <Badge tone="primary" dot>
                Tuyển sinh các lớp mới
              </Badge>
              <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-neutralText sm:text-5xl">
                Học chắc kiến thức,{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-primary bg-clip-text text-transparent">
                  bứt phá điểm số
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-stone-600">
                Trung tâm <span className="font-semibold text-neutralText">APLUS ACADEMY</span> dạy thêm các môn phổ
                thông cho học sinh <span className="font-semibold text-neutralText">cấp 2 &amp; cấp 3</span> — từ củng cố
                kiến thức nền đến luyện thi vào 10 và THPT Quốc gia.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#courses">
                  <Button variant="primary" className="h-12 px-6 text-base">
                    <Sparkles className="h-5 w-5" />
                    Xem khóa học đang mở
                  </Button>
                </a>
                <a href="#contact">
                  <Button variant="secondary" className="h-12 px-6 text-base">
                    Đăng ký tư vấn miễn phí
                  </Button>
                </a>
              </div>
              <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
                <div>
                  <dt className="text-2xl font-extrabold text-primary">{classCount}+</dt>
                  <dd className="text-sm text-stone-500">Lớp đang mở</dd>
                </div>
                <div>
                  <dt className="text-2xl font-extrabold text-success">{teacherCount}</dt>
                  <dd className="text-sm text-stone-500">Giáo viên</dd>
                </div>
                <div>
                  <dt className="text-2xl font-extrabold text-accent">{SUBJECTS.length}</dt>
                  <dd className="text-sm text-stone-500">Môn học</dd>
                </div>
              </dl>
            </div>

            <div className="relative animate-scale-in">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-tr from-indigo-200/50 via-transparent to-amber-200/50 blur-2xl" />
              <div className="relative rounded-[2rem] border border-stone-200/80 bg-white/70 p-6 shadow-lift backdrop-blur">
                <div className="grid grid-cols-2 gap-3">
                  {SUBJECTS.slice(0, 6).map((s) => (
                    <div
                      key={s.name}
                      className="flex items-center gap-3 rounded-2xl border border-stone-200/70 bg-white p-3 shadow-soft"
                    >
                      <span className={`grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br ${s.tone} text-white`}>
                        <s.icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-semibold text-neutralText">{s.name}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-amber-400 to-accent p-4 text-white">
                  <Target className="h-8 w-8 shrink-0" />
                  <div>
                    <p className="text-sm font-bold">Luyện thi vào 10 &amp; THPT Quốc gia</p>
                    <p className="text-xs text-white/80">Lộ trình bài bản theo từng khối lớp</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* COURSES */}
        <section id="courses" className="scroll-mt-20 border-y border-stone-200/70 bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Badge tone="warning">Đang tuyển sinh</Badge>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-neutralText">Khóa học hiện có</h2>
                <p className="mt-3 max-w-2xl text-stone-600">
                  Các lớp đang mở tại trung tâm. Liên hệ để được tư vấn lịch học và xếp lớp phù hợp.
                </p>
              </div>
              <a href="#contact" className="hidden sm:block">
                <Button variant="accent">Đăng ký ngay</Button>
              </a>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {COURSES.map((c) => {
                const style = inferCourseStyle(c.name);
                const Icon = style.icon;
                return (
                  <article
                    key={c.name}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-card"
                  >
                    <span className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${style.tone}`} />
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${style.tone} text-white shadow-sm`}
                      >
                        <Icon className="h-6 w-6" />
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style.chip}`}>
                        Đang mở
                      </span>
                    </div>
                    <h3 className="mt-4 text-lg font-bold text-neutralText">{c.name}</h3>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-500">
                      <GraduationCap className="h-4 w-4" />
                      GV {c.teacherName}
                    </p>
                    <dl className="mt-4 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <dt className="text-stone-500">Học phí / buổi</dt>
                        <dd className="font-semibold text-neutralText">{formatCurrency(c.pricePerSession)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt className="text-stone-500">Số buổi / tháng</dt>
                        <dd className="font-semibold text-neutralText">{c.sessionsPerMonthDefault} buổi</dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex items-center justify-end border-t border-stone-100 pt-4">
                      <a href="#contact" className="text-sm font-semibold text-primary hover:underline">
                        Đăng ký →
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* SUBJECTS */}
        <section id="subjects" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <div className="text-center">
            <Badge tone="neutral">Môn học</Badge>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-neutralText">
              Đầy đủ các môn phổ thông
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-stone-600">
              Học sinh cấp 2 và cấp 3 có thể chọn học theo từng môn hoặc theo combo luyện thi.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {SUBJECTS.map((s) => (
              <div
                key={s.name}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-stone-200/80 bg-white p-6 text-center shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-card"
              >
                <span
                  className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${s.tone} text-white shadow-sm transition-transform duration-200 group-hover:scale-110`}
                >
                  <s.icon className="h-7 w-7" />
                </span>
                <span className="text-base font-semibold text-neutralText">{s.name}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm text-stone-600">
            <Target className="h-4 w-4 text-accent" />
            Có lớp <span className="font-semibold text-neutralText">luyện thi vào 10</span> và{" "}
            <span className="font-semibold text-neutralText">THPT Quốc gia</span> cho các môn.
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16">
          <div className="text-center">
            <Badge tone="success">Vì sao chọn APLUS</Badge>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-neutralText">
              Đồng hành cùng con trên từng chặng đường
            </h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-stone-200/80 bg-white p-6 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-card"
              >
                <span className={`grid h-12 w-12 place-items-center rounded-2xl ${r.chip}`}>
                  <r.icon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-base font-bold text-neutralText">{r.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{r.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* TEACHERS */}
        {teachers.length > 0 ? (
          <section id="teachers" className="scroll-mt-20 border-t border-stone-200/70 bg-white/60">
            <div className="mx-auto max-w-6xl px-4 py-16">
              <div className="text-center">
                <Badge tone="neutral">Đội ngũ giáo viên</Badge>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-neutralText">
                  Thầy cô trực tiếp giảng dạy
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-stone-600">
                  Giáo viên tận tâm, bám sát chương trình và đồng hành cùng học sinh trong từng buổi học.
                </p>
              </div>
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {teachers.map((t, i) => {
                  const subjectList = [...t.subjects];
                  const profile = TEACHER_PROFILES[t.name];
                  const bio = profile?.bio?.trim();
                  const photo = profile?.photo?.trim();
                  return (
                    <article
                      key={t.name}
                      className="flex flex-col rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-1 hover:shadow-card"
                    >
                      <div className="flex items-center gap-4">
                        {photo ? (
                          <img
                            src={photo}
                            alt={teacherLabel(t.name)}
                            className="h-16 w-16 shrink-0 rounded-2xl border border-stone-200 object-cover shadow-sm"
                          />
                        ) : (
                          <span
                            className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${AVATAR_TONES[i % AVATAR_TONES.length]} text-xl font-extrabold text-white shadow-sm`}
                          >
                            {initials(t.name)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-bold text-neutralText">{teacherLabel(t.name)}</h3>
                          <p className="mt-0.5 text-sm text-stone-500">
                            {subjectList.length > 0 ? subjectList.join(" · ") : "Bổ trợ kiến thức"}
                          </p>
                          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-stone-400">
                            <GraduationCap className="h-4 w-4" />
                            Phụ trách {t.classes} lớp
                          </p>
                        </div>
                      </div>
                      {bio ? (
                        <p className="mt-4 border-t border-stone-100 pt-4 text-sm leading-relaxed text-stone-600">{bio}</p>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        ) : null}

        {/* CTA + CONTACT */}
        <section id="contact" className="scroll-mt-20 border-t border-stone-200/70 bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 to-primary p-8 text-white shadow-lift sm:p-12">
              <div className="grid gap-10 md:grid-cols-2">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight">Đăng ký học &amp; tư vấn</h2>
                  <p className="mt-3 max-w-md text-white/85">
                    Để lại lời nhắn hoặc gọi trực tiếp, trung tâm sẽ tư vấn lộ trình và xếp lớp phù hợp cho con.
                  </p>
                  <div className="mt-8 space-y-4">
                    <a
                      href={`tel:${CONTACT.phone.replace(/\s/g, "")}`}
                      className="flex items-center gap-3 text-white transition-opacity hover:opacity-90"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                        <Phone className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-xs text-white/70">Điện thoại / Zalo</span>
                        <span className="text-base font-semibold">{CONTACT.phone}</span>
                      </span>
                    </a>
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                        <MapPin className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-xs text-white/70">Địa chỉ</span>
                        <span className="text-base font-semibold">{CONTACT.address}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                        <Clock className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-xs text-white/70">Giờ làm việc</span>
                        <span className="text-base font-semibold">{CONTACT.hours}</span>
                      </span>
                    </div>
                    <a
                      href={CONTACT.facebookUrl}
                      className="flex items-center gap-3 text-white transition-opacity hover:opacity-90"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15">
                        <Facebook className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-xs text-white/70">Facebook</span>
                        <span className="text-base font-semibold">{CONTACT.facebookLabel}</span>
                      </span>
                    </a>
                  </div>
                </div>

                <div className="rounded-2xl bg-white p-6 text-neutralText shadow-card">
                  <h3 className="text-lg font-bold">Ưu đãi khi đăng ký sớm</h3>
                  <ul className="mt-4 space-y-3 text-sm text-stone-600">
                    {[
                      "Học thử miễn phí buổi đầu tiên",
                      "Kiểm tra trình độ và tư vấn lộ trình cá nhân",
                      "Lớp sĩ số nhỏ, giáo viên kèm sát",
                      "Cập nhật tình hình học tập cho phụ huynh"
                    ].map((item) => (
                      <li key={item} className="flex items-start gap-2.5">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`https://zalo.me/${CONTACT.phone.replace(/^0/, "84")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-6 block"
                  >
                    <Button variant="accent" className="w-full">
                      <Phone className="h-5 w-5" />
                      Liên hệ qua Zalo
                    </Button>
                  </a>
                  <a
                    href={CONTACT.facebookUrl}
                    className="focus-ring mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white text-sm font-semibold hover:bg-stone-50"
                  >
                    <MessageCircle className="h-5 w-5" />
                    Nhắn tin qua Facebook
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-stone-200/70 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 rounded-xl border border-stone-200 bg-white object-cover"
            />
            <div className="leading-tight">
              <p className="text-sm font-bold text-primary">APLUS ACADEMY</p>
              <p className="text-xs text-stone-500">Dạy thêm cấp 2 &amp; cấp 3</p>
            </div>
          </div>
          <p className="text-xs text-stone-400">
            © {new Date().getFullYear()} APLUS ACADEMY. Mọi quyền được bảo lưu.
          </p>
          <Link href="/admin" className="text-xs font-medium text-stone-400 hover:text-primary">
            Đăng nhập quản trị
          </Link>
        </div>
      </footer>
    </div>
  );
}
