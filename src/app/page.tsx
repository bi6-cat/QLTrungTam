import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader } from "next/font/google";
import {
  ArrowRight,
  ArrowUpRight,
  Atom,
  BookOpen,
  Calculator,
  Check,
  Clock,
  Dna,
  Facebook,
  FlaskConical,
  Globe2,
  GraduationCap,
  Landmark,
  Languages,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  Shield,
  Target
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { CENTER_INFO } from "@/lib/center";

// Font serif cho tiêu đề, chỉ nạp ở trang chủ (khu quản trị vẫn dùng Inter).
const display = Newsreader({
  subsets: ["latin", "vietnamese"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display"
});

export const metadata: Metadata = {
  title: { absolute: "APLUS ACADEMY · Dạy thêm cấp 2 & cấp 3" },
  description:
    "Trung tâm APLUS ACADEMY dạy thêm các môn phổ thông cho học sinh cấp 2 & cấp 3, luyện thi vào 10 và THPT Quốc gia. Học thử miễn phí buổi đầu."
};

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

const PHONE_HREF = `tel:${CONTACT.phone.replace(/\s/g, "")}`;
const ZALO_HREF = `https://zalo.me/${CONTACT.phone.replace(/\s/g, "").replace(/^0/, "84")}`;
const MAPS_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACT.address)}`;

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
  { name: "Tiếng Anh 10", teacherName: "Cô Lệ", pricePerSession: 50000, sessionsPerMonthDefault: 8 },
  { name: "Toán 10", teacherName: "Cô Hằng", pricePerSession: 50000, sessionsPerMonthDefault: 8 }
] as const;

// Các môn trung tâm đang giảng dạy (dải "Môn học" dưới hero).
const SUBJECTS = [
  { name: "Toán", icon: Calculator },
  { name: "Vật lý", icon: Atom },
  { name: "Hóa học", icon: FlaskConical },
  { name: "Ngữ văn", icon: BookOpen },
  { name: "Tiếng Anh", icon: Languages },
  { name: "Sinh học", icon: Dna },
  { name: "Lịch sử", icon: Landmark },
  { name: "Địa lý", icon: Globe2 }
] as const;

const REASONS = [
  {
    title: "Giáo viên tận tâm, kinh nghiệm",
    desc: "Đội ngũ giáo viên bám sát chương trình cấp 2 & cấp 3, chữa bài kỹ, quan tâm từng học sinh."
  },
  {
    title: "Lớp sĩ số nhỏ",
    desc: "Giới hạn số lượng mỗi lớp để thầy cô kèm sát, học sinh được hỏi bài và luyện tập nhiều hơn."
  },
  {
    title: "Lộ trình theo mục tiêu",
    desc: "Từ củng cố kiến thức nền đến luyện thi vào 10 và THPT Quốc gia, có lộ trình rõ ràng theo từng khối."
  },
  {
    title: "Đồng hành cùng phụ huynh",
    desc: "Phản hồi tình hình học tập thường xuyên, minh bạch học phí và lịch học qua hệ thống trực tuyến."
  }
] as const;

const STEPS = [
  { title: "Liên hệ tư vấn", desc: "Gọi điện, nhắn Zalo hoặc Facebook để trung tâm nắm nhu cầu của con." },
  { title: "Kiểm tra trình độ", desc: "Đánh giá nhanh kiến thức hiện tại để tư vấn lộ trình phù hợp." },
  { title: "Học thử miễn phí", desc: "Con học thử buổi đầu tiên, làm quen với thầy cô và lớp học." },
  { title: "Vào lớp chính thức", desc: "Nhận lịch học và đường link học phí riêng để phụ huynh tiện theo dõi." }
] as const;

const PERKS = [
  "Học thử miễn phí buổi đầu tiên",
  "Kiểm tra trình độ và tư vấn lộ trình cá nhân",
  "Lớp sĩ số nhỏ, giáo viên kèm sát",
  "Cập nhật tình hình học tập cho phụ huynh"
] as const;

/**
 * Câu hỏi thường gặp.
 * 👉 Sửa nội dung trả lời ở đây khi chính sách của trung tâm thay đổi.
 */
const FAQS = [
  {
    q: "Con có được học thử trước khi đăng ký không?",
    a: "Có. Buổi học đầu tiên miễn phí để con làm quen với thầy cô và lớp học, sau đó phụ huynh mới quyết định đăng ký."
  },
  {
    q: "Học phí được tính như thế nào?",
    a: "Học phí tính theo buổi và đóng theo tháng. Mức học phí của từng lớp được ghi rõ ở mục Khóa học phía trên."
  },
  {
    q: "Phụ huynh đóng học phí bằng cách nào?",
    a: "Mỗi học sinh có một đường link học phí riêng. Phụ huynh mở link, xem số tiền của tháng và quét mã QR để chuyển khoản."
  },
  {
    q: "Trung tâm có lớp luyện thi không?",
    a: "Có lớp luyện thi vào 10 và THPT Quốc gia cho các môn, với lộ trình ôn tập theo từng khối lớp."
  },
  {
    q: "Lịch học được sắp xếp ra sao?",
    a: `Mỗi lớp thường học khoảng 8 buổi/tháng. Trung tâm làm việc ${CONTACT.hours.toLowerCase()}, liên hệ để được xếp khung giờ phù hợp.`
  }
] as const;

const NAV = [
  { href: "#courses", label: "Khóa học" },
  { href: "#teachers", label: "Giáo viên" },
  { href: "#why", label: "Vì sao chọn" },
  { href: "#faq", label: "Hỏi đáp" },
  { href: "#contact", label: "Liên hệ" }
] as const;

// Icon cho thẻ khóa học suy ra từ tên lớp (VD "Toán 9", "Hóa 11"…).
function inferCourseIcon(name: string) {
  const n = name.toLowerCase();
  const match = (...keys: string[]) => keys.some((k) => n.includes(k));
  if (match("toán")) return Calculator;
  if (match("lý", "vật lý")) return Atom;
  if (match("hóa")) return FlaskConical;
  if (match("văn")) return BookOpen;
  if (match("anh", "english")) return Languages;
  if (match("sinh")) return Dna;
  if (match("sử")) return Landmark;
  if (match("địa")) return Globe2;
  return GraduationCap;
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
  return (parts[0][0] + (parts.length > 1 ? last[0] : "")).toUpperCase();
}

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2";
const focus = `${ring} focus-visible:ring-offset-ivory`;
const focusOnDark = `${ring} focus-visible:ring-offset-ink`;
// Kích thước nút (h-*, px-*) đặt ở chỗ dùng: nối thêm class trùng loại không đè được nhau.
const pill = "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-200";
const btnDark = `${focus} ${pill} bg-ink text-white hover:bg-ink-soft`;
const btnOutline = `${focus} ${pill} border border-ink/15 text-ink hover:border-ink/30 hover:bg-white`;

function SectionHeading({
  eyebrow,
  title,
  desc,
  align = "left"
}: {
  eyebrow: string;
  title: React.ReactNode;
  desc?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-dark">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-normal leading-tight tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {desc ? <p className="mt-4 text-base leading-relaxed text-ink-muted">{desc}</p> : null}
    </div>
  );
}

function ContactRow({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-5">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brass-light" strokeWidth={1.75} />
      <div className="min-w-0">
        <dt className="text-xs text-white/50">{label}</dt>
        <dd className="mt-1 break-words font-medium">{children}</dd>
      </div>
    </div>
  );
}

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
    // Phủ nền ngà lên nền gradient chung của body; chừa chỗ cho thanh liên hệ dưới cùng trên điện thoại.
    <div className={`${display.variable} min-h-screen bg-ivory pb-20 text-ink md:pb-0`}>
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-ink/5 bg-ivory/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className={`${focus} flex min-w-0 items-center gap-2.5 rounded-lg`}>
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 shrink-0 rounded-full border border-ink/10 bg-white object-cover"
            />
            <span className="truncate text-sm font-semibold tracking-[0.06em] text-ink sm:tracking-[0.12em]">APLUS ACADEMY</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-ink-muted md:flex">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className={`${focus} rounded transition-colors hover:text-ink`}>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/admin"
              aria-label="Trang quản trị"
              title="Trang quản trị"
              className={`${focus} inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full text-sm text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink sm:w-auto sm:px-3`}
            >
              <Shield className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
            <a href="#contact" className={`${btnDark} h-10 px-4 sm:px-5`}>
              <span className="sm:hidden">Đăng ký</span>
              <span className="hidden sm:inline">Đăng ký học</span>
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 -top-48 h-[640px] w-[640px] bg-[radial-gradient(closest-side,rgba(184,146,90,0.2),transparent)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 md:grid-cols-[1.15fr_1fr] md:pb-24 md:pt-24">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-ink/10 bg-white/60 px-3 py-1 text-xs font-medium text-ink-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brass" />
                Tuyển sinh các lớp mới
              </p>
              <h1 className="mt-6 font-display text-[2.6rem] font-normal leading-[1.08] tracking-tight text-ink sm:text-6xl">
                Học chắc kiến thức, <em className="whitespace-nowrap text-brass-dark">bứt phá</em> điểm số.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-muted">
                APLUS ACADEMY dạy thêm các môn phổ thông cho học sinh cấp 2 &amp; cấp 3 — từ củng cố kiến thức nền đến
                luyện thi vào 10 và THPT Quốc gia.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#contact" className={`${btnDark} h-12 px-6`}>
                  Đăng ký học thử miễn phí
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a href="#courses" className={`${btnOutline} h-12 px-6`}>
                  Xem khóa học
                </a>
              </div>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
                {PERKS.slice(0, 3).map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-brass-dark" strokeWidth={2.25} />
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-scale-in rounded-3xl bg-ink p-7 text-white shadow-[0_30px_60px_-30px_rgba(14,23,38,0.55)] sm:p-9">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-light">Năm học mới</p>
              <p className="mt-4 font-display text-3xl leading-snug">
                Lộ trình rõ ràng cho <em className="whitespace-nowrap text-brass-light">từng khối lớp</em>.
              </p>
              <dl className="mt-8 grid grid-cols-3 divide-x divide-white/10 border-y border-white/10 py-6">
                {[
                  { value: `${classCount}+`, label: "Lớp đang mở" },
                  { value: teacherCount, label: "Giáo viên" },
                  { value: SUBJECTS.length, label: "Môn học" }
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col-reverse px-3 first:pl-0 last:pr-0">
                    <dt className="mt-1 text-xs text-white/60">{stat.label}</dt>
                    <dd className="font-display text-4xl text-brass-light">{stat.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10">
                  <Target className="h-5 w-5 text-brass-light" strokeWidth={1.75} />
                </span>
                <div>
                  <p className="text-sm font-semibold">Luyện thi vào 10 &amp; THPT Quốc gia</p>
                  <p className="text-xs text-white/60">Ôn tập bài bản theo từng khối lớp</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SUBJECTS */}
        <section id="subjects" aria-label="Môn học" className="scroll-mt-20 border-y border-ink/5 bg-white/50">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 md:flex-row md:items-center md:gap-10">
            <p className="shrink-0 text-xs font-semibold uppercase tracking-[0.18em] text-brass-dark">Giảng dạy</p>
            <ul className="flex flex-wrap gap-x-7 gap-y-3 text-sm text-ink-muted">
              {SUBJECTS.map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-ink/70" strokeWidth={1.75} />
                  {s.name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* COURSES */}
        <section id="courses" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHeading
              eyebrow="Khóa học"
              title="Các lớp đang tuyển sinh"
              desc="Liên hệ để được tư vấn lịch học và xếp lớp phù hợp với trình độ của con."
            />
            <a
              href="#contact"
              className={`${focus} group hidden items-center gap-1.5 rounded text-sm font-semibold text-ink sm:inline-flex`}
            >
              Đăng ký tư vấn
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {COURSES.map((c) => {
              const Icon = inferCourseIcon(c.name);
              return (
                <article
                  key={c.name}
                  className="group flex flex-col rounded-2xl border border-ink/10 bg-white p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-ink/20 hover:shadow-soft"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-ivory text-ink">
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-medium text-brass-dark">Đang tuyển sinh</span>
                  </div>
                  <h3 className="mt-6 font-display text-2xl text-ink">{c.name}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{teacherLabel(c.teacherName)}</p>
                  <div className="mt-6 flex items-end justify-between gap-3 border-t border-ink/5 pt-4">
                    <p>
                      <span className="text-lg font-semibold text-ink">{formatCurrency(c.pricePerSession)}</span>
                      <span className="text-sm text-ink-muted"> / buổi</span>
                    </p>
                    <p className="text-sm text-ink-muted">{c.sessionsPerMonthDefault} buổi/tháng</p>
                  </div>
                  <a
                    href="#contact"
                    className={`${focus} mt-5 inline-flex items-center gap-1.5 self-start rounded text-sm font-semibold text-ink`}
                  >
                    Đăng ký lớp này
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </a>
                </article>
              );
            })}
            <a
              href="#contact"
              className={`${focus} group flex flex-col justify-between rounded-2xl border border-dashed border-ink/20 p-6 transition-colors hover:border-ink/40 hover:bg-white/60`}
            >
              <div>
                <p className="font-display text-2xl text-ink">Chưa thấy lớp phù hợp?</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                  Cho trung tâm biết môn và khối lớp con cần học, chúng tôi sẽ tư vấn và xếp lớp phù hợp.
                </p>
              </div>
              <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                Liên hệ tư vấn
                <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </span>
            </a>
          </div>
        </section>

        {/* WHY */}
        <section id="why" className="scroll-mt-20 bg-ivory-deep/60">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-28">
            <div className="md:sticky md:top-28 md:self-start">
              <SectionHeading
                eyebrow="Vì sao chọn APLUS"
                title={
                  <>
                    Đồng hành cùng con trên <em className="text-brass-dark">từng chặng đường</em>.
                  </>
                }
                desc="Một môi trường học tập nghiêm túc nhưng gần gũi, nơi mỗi học sinh đều được thầy cô quan tâm."
              />
            </div>
            <ol className="divide-y divide-ink/10 border-y border-ink/10">
              {REASONS.map((r, i) => (
                <li key={r.title} className="grid grid-cols-[3rem_1fr] gap-4 py-7">
                  <span className="font-display text-xl text-brass-dark">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-lg font-semibold text-ink">{r.title}</h3>
                    <p className="mt-2 leading-relaxed text-ink-muted">{r.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* TEACHERS */}
        {teachers.length > 0 ? (
          <section id="teachers" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
            <SectionHeading
              eyebrow="Đội ngũ giáo viên"
              title="Thầy cô trực tiếp giảng dạy"
              desc="Giáo viên tận tâm, bám sát chương trình và đồng hành cùng học sinh trong từng buổi học."
            />
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((t) => {
                const subjectList = [...t.subjects];
                const profile = TEACHER_PROFILES[t.name];
                const bio = profile?.bio?.trim();
                const photo = profile?.photo?.trim();
                return (
                  <article key={t.name} className="flex flex-col rounded-2xl border border-ink/10 bg-white p-6">
                    <div className="flex items-center gap-4">
                      {photo ? (
                        <img
                          src={photo}
                          alt={teacherLabel(t.name)}
                          className="h-14 w-14 shrink-0 rounded-full border border-ink/10 object-cover"
                        />
                      ) : (
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-ivory-deep font-display text-xl text-ink">
                          {initials(t.name)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-xl text-ink">{teacherLabel(t.name)}</h3>
                        <p className="mt-0.5 text-sm text-ink-muted">
                          {subjectList.length > 0 ? subjectList.join(" · ") : "Bổ trợ kiến thức"}
                          <span className="text-ink/30"> — </span>
                          {t.classes} lớp
                        </p>
                      </div>
                    </div>
                    {bio ? (
                      <p className="mt-5 border-t border-ink/5 pt-5 text-sm leading-relaxed text-ink-muted">{bio}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* STEPS */}
        <section id="steps" className="scroll-mt-20 border-y border-ink/5 bg-white/60">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
            <SectionHeading
              eyebrow="Đăng ký"
              title="Bắt đầu chỉ với 4 bước"
              desc="Thủ tục đơn giản, phụ huynh nắm rõ lộ trình và học phí ngay từ đầu."
              align="center"
            />
            <ol className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span className="grid h-10 w-10 place-items-center rounded-full border border-ink/15 bg-ivory font-display text-lg text-ink">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 ? (
                    <span aria-hidden="true" className="absolute left-14 right-0 top-5 hidden h-px bg-ink/10 lg:block" />
                  ) : null}
                  <h3 className="mt-5 text-base font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{s.desc}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="mx-auto grid max-w-6xl scroll-mt-20 gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-28"
        >
          <SectionHeading
            eyebrow="Hỏi đáp"
            title="Câu hỏi phụ huynh hay gặp"
            desc="Chưa thấy câu trả lời bạn cần? Gọi hoặc nhắn Zalo cho trung tâm trong giờ làm việc."
          />
          <div className="divide-y divide-ink/10 border-y border-ink/10">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-1">
                <summary
                  className={`${focus} flex cursor-pointer list-none items-center justify-between gap-6 rounded py-5 text-base font-semibold text-ink [&::-webkit-details-marker]:hidden`}
                >
                  {f.q}
                  <Plus
                    className="h-5 w-5 shrink-0 text-ink-muted transition-transform duration-200 group-open:rotate-45"
                    strokeWidth={1.75}
                  />
                </summary>
                <p className="pb-6 pr-10 leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA + CONTACT */}
        <section id="contact" className="scroll-mt-20 px-4 pb-20 sm:px-6 md:pb-28">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-48 -left-40 h-[520px] w-[520px] bg-[radial-gradient(closest-side,rgba(184,146,90,0.22),transparent)]"
            />
            <div className="relative grid gap-12 p-7 sm:p-12 md:grid-cols-2 lg:p-16">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brass-light">Đăng ký &amp; tư vấn</p>
                <h2 className="mt-4 font-display text-4xl leading-tight sm:text-5xl">
                  Cho con <em className="text-brass-light">học thử</em> miễn phí buổi đầu.
                </h2>
                <p className="mt-5 max-w-md leading-relaxed text-white/70">
                  Để lại lời nhắn hoặc gọi trực tiếp, trung tâm sẽ tư vấn lộ trình và xếp lớp phù hợp cho con.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-white/80">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brass-light" strokeWidth={2.25} />
                      {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-wrap gap-3">
                  <a
                    href={ZALO_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${focusOnDark} ${pill} h-12 bg-brass-light px-6 text-ink hover:bg-white`}
                  >
                    <MessageCircle className="h-4 w-4" />
                    Nhắn Zalo
                  </a>
                  <a
                    href={PHONE_HREF}
                    className={`${focusOnDark} ${pill} h-12 border border-white/20 px-6 text-white hover:border-white/40 hover:bg-white/5`}
                  >
                    <Phone className="h-4 w-4" />
                    Gọi {CONTACT.phone}
                  </a>
                </div>
              </div>

              <dl className="divide-y divide-white/10 self-end border-y border-white/10">
                <ContactRow icon={Phone} label="Điện thoại / Zalo">
                  <a href={PHONE_HREF} className="hover:text-brass-light">
                    {CONTACT.phone}
                  </a>
                </ContactRow>
                <ContactRow icon={MapPin} label="Địa chỉ">
                  {CONTACT.address}
                  <a
                    href={MAPS_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex w-fit items-center gap-1 text-sm font-normal text-brass-light hover:text-white"
                  >
                    Xem bản đồ
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </ContactRow>
                <ContactRow icon={Clock} label="Giờ làm việc">
                  {CONTACT.hours}
                </ContactRow>
                <ContactRow icon={Facebook} label="Facebook">
                  <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-brass-light">
                    {CONTACT.facebookLabel}
                  </a>
                </ContactRow>
              </dl>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-ink/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 rounded-full border border-ink/10 bg-white object-cover"
            />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-[0.12em] text-ink">APLUS ACADEMY</p>
              <p className="text-xs text-ink-muted">Dạy thêm cấp 2 &amp; cấp 3</p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
            {NAV.map((item) => (
              <a key={item.href} href={item.href} className="hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-1 text-xs text-ink-muted md:items-end">
            <p>© {new Date().getFullYear()} APLUS ACADEMY</p>
            <Link href="/admin" className="hover:text-ink">
              Đăng nhập quản trị
            </Link>
          </div>
        </div>
      </footer>

      {/* Thanh liên hệ nhanh cố định dưới cùng — chỉ trên điện thoại. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-ivory/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <a href={PHONE_HREF} className={`${btnOutline} h-11 px-4`}>
            <Phone className="h-4 w-4" />
            Gọi ngay
          </a>
          <a href={ZALO_HREF} target="_blank" rel="noopener noreferrer" className={`${btnDark} h-11 px-4`}>
            <MessageCircle className="h-4 w-4" />
            Nhắn Zalo
          </a>
        </div>
      </div>
    </div>
  );
}
