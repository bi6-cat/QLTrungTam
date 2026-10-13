import type { Metadata } from "next";
import Link from "next/link";
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
  FileText,
  FlaskConical,
  Globe2,
  GraduationCap,
  Landmark,
  Languages,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  QrCode,
  Quote,
  Shield,
  Sparkles,
  Star,
  Target
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { CENTER_INFO } from "@/lib/center";
import { handFont, publicFont } from "./fonts";

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
  taxCode: CENTER_INFO.taxCode,
  hours: "7h00 – 23h00, tất cả các ngày trong tuần",
  facebookUrl: "https://www.facebook.com/apeduvn/",
  facebookLabel: "Luyện thi & bổ trợ kiến thức A+ Academy",
  email: CENTER_INFO.email
};

const PHONE_HREF = `tel:${CONTACT.phone.replace(/\s/g, "")}`;
const ZALO_HREF = `https://zalo.me/${CONTACT.phone.replace(/\s/g, "").replace(/^0/, "84")}`;
const MAPS_HREF = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CONTACT.address)}`;
// Hiển thị số điện thoại dạng 0886 422 714 cho dễ đọc.
const PHONE_DISPLAY = CONTACT.phone.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");

/**
 * Ảnh thật của trung tâm.
 * 👉 Đặt file vào /public/photos (VD public/photos/lop-hoc.jpg) rồi ghi "/photos/lop-hoc.jpg".
 *    Để trống thì hiện hình minh họa.
 */
const PHOTOS = {
  hero: "/photos/lop-hoc.jpg", // Ảnh lớp học đang học, ngang (4:3)
  tutoring: "" // Cận cảnh thầy cô kèm một học sinh, ngang (VD "/photos/kem-sat.jpg")
}

/**
 * Cảm nhận của phụ huynh / học sinh — chỉ dùng câu nhận xét THẬT, tên viết tắt.
 * 👉 VD: { quote: "Con tiến bộ rõ sau 2 tháng…", name: "Chị H.", role: "Phụ huynh lớp Toán 9" }
 *    Để trống thì ẩn cả khối.
 */
const TESTIMONIALS: { quote: string; name: string; role: string }[] = [
  {
    quote:
      "Con học có tiến bộ, điểm trên lớp nhích lên đều. Cái mình ưng nhất là con đã tự giác ngồi làm bài tập ở nhà hơn, bớt sợ môn này đi nhiều rồi.",
    name: "Chị H.",
    role: "Phụ huynh"
  },
  {
    quote:
      "Thầy cô ở đây khá sát sao. Phần nào con làm sai hoặc trên lớp chưa nắm kịp đều được chữa chi tiết và giảng lại ngay. Cảm giác gia đình gửi gắm rất yên tâm.",
    name: "Anh T.",
    role: "Phụ huynh"
  },
  {
    quote: "Lớp học thoải mái, mọi người đều hòa đồng. Thầy cô giảng bài dễ hiểu nên em đi học thấy vui vẻ và không bị áp lực.",
    name: "Em M.",
    role: "Học sinh"
  }
];

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

// Các môn trung tâm đang giảng dạy, mỗi môn một màu riêng (dải môn học và thẻ khóa học).
const SUBJECTS = [
  { name: "Toán", icon: Calculator, tile: "bg-indigo-50 text-indigo-600", band: "from-indigo-500 to-indigo-600" },
  { name: "Vật lý", icon: Atom, tile: "bg-sky-50 text-sky-600", band: "from-sky-400 to-sky-600" },
  { name: "Hóa học", icon: FlaskConical, tile: "bg-emerald-50 text-emerald-600", band: "from-emerald-400 to-emerald-600" },
  { name: "Ngữ văn", icon: BookOpen, tile: "bg-rose-50 text-rose-600", band: "from-rose-400 to-rose-600" },
  { name: "Tiếng Anh", icon: Languages, tile: "bg-violet-50 text-violet-600", band: "from-violet-500 to-fuchsia-500" },
  { name: "Sinh học", icon: Dna, tile: "bg-lime-50 text-lime-700", band: "from-lime-400 to-green-600" },
  { name: "Lịch sử", icon: Landmark, tile: "bg-amber-50 text-amber-700", band: "from-amber-400 to-orange-500" },
  { name: "Địa lý", icon: Globe2, tile: "bg-cyan-50 text-cyan-700", band: "from-cyan-400 to-teal-600" }
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
  "Chữa bài kỹ, chưa hiểu được giảng lại",
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
  { href: "#why", label: "Vì sao chọn" },
  { href: "#courses", label: "Khóa học" },
  { href: "#teachers", label: "Giáo viên" },
  { href: "#faq", label: "Hỏi đáp" },
  { href: "#contact", label: "Liên hệ" }
] as const;

const FALLBACK_STYLE = {
  icon: GraduationCap,
  tile: "bg-slate-100 text-slate-600",
  band: "from-slate-400 to-slate-600"
};

// Icon + màu cho thẻ khóa học suy ra từ tên lớp (VD "Toán 9", "Hóa 11"…).
function inferCourseStyle(name: string) {
  const subject = inferSubjectName(name);
  return SUBJECTS.find((s) => s.name === subject) ?? FALLBACK_STYLE;
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

// Nền ảnh "polaroid" giáo viên khi chưa có ảnh, và độ nghiêng xen kẽ cho sinh động.
const POLAROID_TONES = [
  "from-indigo-200 to-indigo-400 text-indigo-900",
  "from-amber-200 to-orange-300 text-amber-900",
  "from-emerald-200 to-teal-300 text-emerald-900",
  "from-rose-200 to-pink-300 text-rose-900",
  "from-sky-200 to-cyan-300 text-sky-900"
] as const;
const TILTS = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-0"] as const;

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-offset-2";
const focus = `${ring} focus-visible:ring-brand focus-visible:ring-offset-white`;
const focusOnDark = `${ring} focus-visible:ring-sun focus-visible:ring-offset-brand-deep`;
// Kích thước nút (h-*, px-*) đặt ở chỗ dùng: nối thêm class trùng loại không đè được nhau.
const pill = "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-all duration-200";
// Nút chính kiểu "bấm được": viền đáy đậm, nhấn xuống khi hover.
const btnPrimary = `${focus} ${pill} bg-brand text-white shadow-[0_4px_0_0_#312E81] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_#312E81]`;
const btnOutline = `${focus} ${pill} border-2 border-ink/10 bg-white text-ink hover:border-brand/40 hover:text-brand`;

/* ---------- Nét vẽ tay ---------- */

function Underline({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 220 24" preserveAspectRatio="none" className={className} fill="none">
      <path d="M4 16 C 50 6, 110 4, 216 12" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
    </svg>
  );
}

function CurvyArrow({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 120 80" className={className} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 10 C 40 0, 90 10, 96 60" />
      <path d="M84 52 L 96 64 L 106 50" />
    </svg>
  );
}

function Sparkle({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0 C 13 7, 17 11, 24 12 C 17 13, 13 17, 12 24 C 11 17, 7 13, 0 12 C 7 11, 11 7, 12 0 Z" />
    </svg>
  );
}

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
      <p className="font-hand text-2xl text-brand">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-extrabold leading-[1.15] tracking-tight text-ink [text-wrap:balance] sm:text-[2.6rem]">
        {title}
      </h2>
      {desc ? <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">{desc}</p> : null}
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
    <div className="flex gap-4 py-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10">
        <Icon className="h-5 w-5 text-sun" strokeWidth={1.75} />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-white/60">{label}</dt>
        <dd className="mt-0.5 break-words font-medium">{children}</dd>
      </div>
    </div>
  );
}

function FooterHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-white">{children}</h3>;
}

/**
 * Minh họa "hiểu bài ngay tại lớp": bảng phấn có bài vừa giải xong, bóng đèn "à ra thế",
 * bong bóng từ "?" thành "!". Dùng khi chưa có ảnh cho ô lớn ở phần "Vì sao chọn".
 */
function UnderstandIllustration({ className = "" }: { className?: string }) {
  const hand = { fontFamily: "var(--font-hand), 'Comic Sans MS', cursive" };
  return (
    <svg aria-hidden="true" viewBox="0 0 800 520" preserveAspectRatio="xMidYMin slice" className={className} fill="none">
      <defs>
        <radialGradient id="aplus-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FDE68A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FDE68A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="aplus-board" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#24604A" />
          <stop offset="1" stopColor="#1A4636" />
        </linearGradient>
      </defs>

      {/* chấm nền như giấy kẻ */}
      <g fill="#FFFFFF" opacity="0.08">
        {Array.from({ length: 12 }, (_, row) =>
          Array.from({ length: 20 }, (_, col) => <circle key={`${row}-${col}`} cx={20 + col * 40} cy={20 + row * 40} r="2" />)
        )}
      </g>

      {/* Bảng phấn */}
      <g transform="rotate(-2 360 160)">
        <rect x="150" y="48" width="430" height="240" rx="16" fill="#B7834A" />
        <rect x="164" y="62" width="402" height="212" rx="10" fill="url(#aplus-board)" />
        <text x="190" y="102" fill="#FFFFFF" fillOpacity="0.55" fontSize="22" style={hand}>
          Bài 3
        </text>
        <text x="190" y="148" fill="#FFFFFF" fontSize="38" style={hand}>
          2x + 5 = 11
        </text>
        <text x="190" y="196" fill="#FFFFFF" fillOpacity="0.85" fontSize="38" style={hand}>
          2x = 6
        </text>
        <text x="190" y="246" fill="#FDE68A" fontSize="44" style={hand}>
          x = 3
        </text>
        <path d="M330 232 l14 14 l30 -36" stroke="#FBBF24" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        {/* gạch chân bằng phấn */}
        <path d="M186 258 C 230 252, 290 254, 312 258" stroke="#FDE68A" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
        {/* máng phấn + viên phấn */}
        <rect x="200" y="288" width="330" height="10" rx="5" fill="#8C5F31" />
        <rect x="420" y="279" width="34" height="10" rx="4" fill="#FFFFFF" />
      </g>

      {/* Bóng đèn "à ra thế" */}
      <g>
        <circle cx="660" cy="118" r="96" fill="url(#aplus-glow)" />
        <g stroke="#FBBF24" strokeWidth="6" strokeLinecap="round">
          <path d="M660 24 v-16" />
          <path d="M724 52 l12 -12" />
          <path d="M596 52 l-12 -12" />
          <path d="M752 116 h16" />
          <path d="M568 116 h-16" />
        </g>
        <path d="M660 62 a52 52 0 0 1 30 95 c-7 6 -10 12 -10 20 v6 h-40 v-6 c0 -8 -3 -14 -10 -20 a52 52 0 0 1 30 -95 z" fill="#FBBF24" />
        <path d="M646 132 l14 -26 l14 26" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
        <rect x="638" y="186" width="44" height="10" rx="4" fill="#E2E8F0" />
        <rect x="642" y="199" width="36" height="10" rx="4" fill="#CBD5E1" />
      </g>

      {/* Bong bóng ? -> ! (cột bên trái bảng, tránh vùng chữ phía dưới) */}
      <g>
        <rect x="34" y="92" width="100" height="70" rx="18" fill="#FFFFFF" fillOpacity="0.18" />
        <path d="M58 160 l-6 18 l22 -18 z" fill="#FFFFFF" fillOpacity="0.18" />
        <text x="70" y="143" fill="#FFFFFF" fontSize="46" fontWeight="800" fillOpacity="0.85">?</text>
        <path d="M86 184 C 64 200, 64 212, 82 226" stroke="#FFFFFF" strokeOpacity="0.6" strokeWidth="3" strokeDasharray="6 8" strokeLinecap="round" />
        <rect x="34" y="232" width="100" height="70" rx="18" fill="#FBBF24" />
        <path d="M110 300 l6 18 l-22 -18 z" fill="#FBBF24" />
        <text x="76" y="283" fill="#1E1B4B" fontSize="46" fontWeight="800">!</text>
      </g>

      {/* Chồng sách + bút chì */}
      <g transform="translate(600 300)">
        <rect x="0" y="40" width="150" height="26" rx="5" fill="#F43F5E" />
        <rect x="12" y="14" width="132" height="26" rx="5" fill="#FFFFFF" />
        <rect x="4" y="-12" width="140" height="26" rx="5" fill="#10B981" />
        <rect x="12" y="20" width="110" height="3" rx="1.5" fill="#CBD5E1" />
        <g transform="rotate(-24 70 -40)">
          <rect x="10" y="-52" width="120" height="16" rx="3" fill="#FBBF24" />
          <path d="M130 -52 l22 8 l-22 8 z" fill="#FDE68A" />
          <path d="M146 -46 l6 2 l-6 2 z" fill="#1E1B4B" />
          <rect x="0" y="-52" width="12" height="16" rx="3" fill="#F9A8D4" />
        </g>
      </g>

      {/* Lấp lánh */}
      <g fill="#FDE68A">
        <path d="M118 64 c2 12 6 16 18 18 c-12 2 -16 6 -18 18 c-2 -12 -6 -16 -18 -18 c12 -2 16 -6 18 -18 z" />
        <path d="M560 360 c1.5 9 4.5 12 13.5 13.5 c-9 1.5 -12 4.5 -13.5 13.5 c-1.5 -9 -4.5 -12 -13.5 -13.5 c9 -1.5 12 -4.5 13.5 -13.5 z" opacity="0.8" />
      </g>
    </svg>
  );
}

/** Khung ảnh: có ảnh thật thì hiện ảnh, chưa có thì hiện minh họa các môn học. */
function PhotoSlot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  if (src) return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
  return (
    <div
      role="img"
      aria-label={alt}
      className={`relative grid h-full w-full place-items-center overflow-hidden bg-gradient-to-br from-brand to-indigo-400 ${className}`}
    >
      <div aria-hidden="true" className="absolute inset-0 grid grid-cols-4 place-items-center gap-4 p-6 opacity-20">
        {SUBJECTS.map((s) => (
          <s.icon key={s.name} className="h-9 w-9 text-white" strokeWidth={1.5} />
        ))}
      </div>
      <div className="relative text-center text-white">
        <GraduationCap className="mx-auto h-14 w-14" strokeWidth={1.5} />
        <p className="mt-2 font-hand text-2xl">Lớp học APLUS</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const classCount = COURSES.length;
  const teacherCount = new Set(COURSES.map((c) => c.teacherName)).size;
  const year = new Date().getFullYear();
  const sampleCourse = COURSES.find((c) => inferSubjectName(c.name) === "Toán") ?? COURSES[0];

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
    <div className={`${publicFont.variable} ${handFont.variable} min-h-screen overflow-x-clip bg-white font-display text-ink`}>
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" className={`${focus} flex min-w-0 items-center gap-2.5 rounded-lg`}>
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 shrink-0 rounded-full border border-slate-200 bg-white object-cover"
            />
            <span className="truncate text-[15px] font-extrabold tracking-tight text-brand-deep">
              APLUS <span className="text-brand">ACADEMY</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 text-sm font-medium text-ink-muted md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`${focus} rounded-full px-3 py-2 transition-colors hover:bg-brand-soft hover:text-brand`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link
              href="/admin"
              aria-label="Trang quản trị"
              title="Trang quản trị"
              className={`${focus} inline-flex h-10 w-10 items-center justify-center gap-2 rounded-full text-sm font-medium text-ink-muted transition-colors hover:bg-brand-soft hover:text-brand sm:w-auto sm:px-3`}
            >
              <Shield className="h-4 w-4" strokeWidth={1.75} />
              <span className="hidden sm:inline">Quản trị</span>
            </Link>
            <a href="#contact" className={`${btnPrimary} h-10 px-4 sm:px-5`}>
              <span className="sm:hidden">Đăng ký</span>
              <span className="hidden sm:inline">Đăng ký học</span>
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        {/* HERO */}
        <section className="relative bg-canvas">
          {/* Lưới chấm như giấy kẻ ô vở. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(67,56,202,0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-12 sm:px-6 md:grid-cols-[1.05fr_1fr] md:pb-28 md:pt-20">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-sun/60 bg-sun-soft px-3 py-1 text-xs font-semibold text-sun-dark">
                <Sparkles className="h-3.5 w-3.5" />
                Tuyển sinh năm học mới
              </p>
              <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.08] tracking-tight text-ink [text-wrap:balance] sm:text-6xl lg:text-[3.7rem]">
                Học chắc <span className="whitespace-nowrap">kiến thức,</span>{" "}
                <span className="relative inline-block whitespace-nowrap text-brand">
                  bứt phá
                  <Underline className="absolute -bottom-2 left-0 h-4 w-full text-sun/80" />
                </span>{" "}
                điểm số.
              </h1>
              <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-muted">
                Dạy thêm các môn phổ thông cho học sinh cấp 2 &amp; cấp 3: củng cố kiến thức nền, luyện thi vào 10 và THPT
                Quốc gia, với thầy cô tận tâm và lộ trình rõ ràng cho từng khối.
              </p>
              <div className="relative mt-9 flex flex-wrap items-center gap-3">
                <a href="#contact" className={`${btnPrimary} h-14 px-7 text-base`}>
                  Đăng ký học thử
                  <ArrowRight className="h-5 w-5" />
                </a>
                <a href="#courses" className={`${btnOutline} h-14 px-7 text-base`}>
                  Xem khóa học
                </a>
                <div className="pointer-events-none absolute -bottom-16 left-40 hidden items-end gap-1 text-brand sm:flex">
                  <CurvyArrow className="h-12 w-16 -scale-x-100 -rotate-[160deg]" />
                  <span className="font-hand text-xl">buổi đầu miễn phí!</span>
                </div>
              </div>
              <ul className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted sm:mt-20">
                {PERKS.slice(1, 4).map((perk) => (
                  <li key={perk} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {perk}
                  </li>
                ))}
              </ul>
            </div>

            {/* Bộ sưu tập thẻ nghiêng: ảnh lớp, phiếu học phí QR, sticker. */}
            <div className="relative mx-auto w-full max-w-md animate-scale-in md:max-w-none">
              <Sparkle className="absolute -left-4 top-6 h-7 w-7 text-sun" />
              <Sparkle className="absolute -right-2 bottom-24 h-5 w-5 text-brand/60" />
              <div className="relative rotate-2 overflow-hidden rounded-[2rem] border-[6px] border-white bg-white shadow-[0_30px_60px_-30px_rgba(30,27,75,0.55)]">
                <div className="aspect-[4/3]">
                  <PhotoSlot src={PHOTOS.hero} alt="Lớp học tại APLUS ACADEMY" />
                </div>
              </div>

              <div className="absolute -bottom-10 -left-3 w-60 -rotate-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_20px_40px_-20px_rgba(30,27,75,0.45)] sm:-left-8 sm:w-64">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-ink-muted">Buổi học hôm nay</p>
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand">{sampleCourse.name}</span>
                </div>
                <ul className="mt-3 grid gap-2 text-sm">
                  {["Chữa bài về nhà", "Học bài mới", "Luyện tập tại lớp"].map((item, i) => (
                    <li key={item} className="flex items-center gap-2">
                      <span
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${i < 2 ? "bg-emerald-500 text-white" : "border-2 border-dashed border-sun-dark/50"}`}
                      >
                        {i < 2 ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                      </span>
                      <span className={i < 2 ? "text-ink-muted line-through decoration-ink/20" : "font-semibold"}>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 font-hand text-lg leading-none text-brand">sắp xong rồi!</p>
              </div>

              <div className="absolute -right-2 -top-6 grid h-24 w-24 rotate-12 animate-float place-items-center rounded-full bg-sun text-center shadow-lg motion-reduce:animate-none sm:-right-6">
                <p className="font-hand text-xl leading-5 text-ink">
                  Học thử
                  <br />
                  <span className="text-3xl">0đ</span>
                </p>
              </div>

              <div className="absolute -bottom-6 right-2 flex -rotate-2 items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg sm:right-6">
                <Check className="h-4 w-4 text-sun" strokeWidth={3} />
                Chữa bài mỗi buổi
              </div>
            </div>
          </div>
        </section>

        {/* DẢI MÔN HỌC CHẠY NGANG */}
        <section aria-label="Môn học" className="relative border-y-2 border-ink bg-sun py-4">
          <div className="flex w-max animate-marquee gap-3 motion-reduce:animate-none">
            {[...SUBJECTS, ...SUBJECTS].map((s, i) => (
              <span
                key={`${s.name}-${i}`}
                aria-hidden={i >= SUBJECTS.length ? true : undefined}
                className="flex items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 py-2 text-base font-bold text-ink"
              >
                <s.icon className="h-5 w-5" strokeWidth={2} />
                {s.name}
                <Sparkle className="ml-2 h-3.5 w-3.5 text-brand" />
              </span>
            ))}
          </div>
        </section>

        {/* VÌ SAO CHỌN — BENTO */}
        <section id="why" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
          <SectionHeading
            eyebrow="Vì sao chọn APLUS?"
            title="Một lớp học mà phụ huynh yên tâm, học sinh muốn đến."
            desc="Nghiêm túc trong chuyên môn, gần gũi trong cách dạy, minh bạch với phụ huynh."
          />

          <div className="mt-12 grid gap-4 md:grid-cols-6">
            {/* Ô ảnh lớn: thầy cô kèm từng em */}
            <article className="group relative min-h-[380px] overflow-hidden rounded-[1.75rem] bg-brand-deep md:col-span-4 md:row-span-2 md:min-h-[460px]">
              <div className="absolute inset-0">
                {PHOTOS.tutoring ? (
                  <PhotoSlot
                    src={PHOTOS.tutoring}
                    alt="Thầy cô giảng bài, học sinh hiểu bài ngay tại lớp"
                    className="transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-brand to-indigo-500">
                    <UnderstandIllustration className="h-[68%] w-full transition-transform duration-700 group-hover:scale-[1.03]" />
                  </div>
                )}
              </div>
              <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-brand-deep via-brand-deep/40 to-transparent" />
              <span className="absolute left-5 top-5 inline-flex -rotate-2 items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-lg">
                <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={3} />
                Luyện tập mỗi buổi
              </span>
              <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-8">
                <p className="font-hand text-2xl text-sun">Học hiểu ngay tại lớp</p>
                <h3 className="mt-1 max-w-md text-2xl font-extrabold leading-tight sm:text-3xl">
                  Chưa hiểu chỗ nào, thầy cô giảng lại chỗ đó.
                </h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80 sm:text-base">
                  Buổi nào cũng có phần chữa bài và luyện tập, để con hiểu bài ở lớp chứ không mang thắc mắc về nhà.
                </p>
              </div>
            </article>

            {/* Số liệu */}
            <article className="flex flex-col justify-between gap-5 rounded-[1.75rem] bg-brand-soft p-6 md:col-span-2">
              <p className="text-sm font-semibold text-brand">APLUS hôm nay</p>
              <dl className="grid gap-3">
                {[
                  { value: `${classCount}+`, label: "lớp đang tuyển sinh", dot: "bg-brand" },
                  { value: teacherCount, label: "giáo viên đứng lớp", dot: "bg-sun" },
                  { value: SUBJECTS.length, label: "môn học cấp 2 & 3", dot: "bg-emerald-500" }
                ].map((stat) => (
                  <div key={stat.label} className="flex items-baseline gap-3">
                    <dd className="w-16 text-4xl font-extrabold tracking-tight text-ink">{stat.value}</dd>
                    <dt className="flex items-center gap-2 text-sm text-ink-muted">
                      <span className={`h-2 w-2 rounded-full ${stat.dot}`} />
                      {stat.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </article>

            {/* Lộ trình */}
            <article className="rounded-[1.75rem] bg-sun-soft p-6 md:col-span-2">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Lộ trình theo mục tiêu</h3>
                <Target className="h-6 w-6 text-sun-dark" />
              </div>
              <ol className="relative mt-5 grid gap-4 pl-7">
                <span aria-hidden="true" className="absolute bottom-2 left-[9px] top-2 w-0.5 rounded bg-gradient-to-b from-sun-dark/30 to-sun-dark" />
                {[
                  { title: "Củng cố nền tảng", sub: "Lấp lỗ hổng kiến thức" },
                  { title: "Luyện đề theo dạng", sub: "Làm quen cấu trúc đề thi" },
                  { title: "Về đích", sub: "Thi vào 10 · THPT Quốc gia" }
                ].map((step, i) => (
                  <li key={step.title} className="relative">
                    <span
                      className={`absolute -left-7 top-0.5 grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${i === 2 ? "bg-sun-dark text-white" : "bg-white text-sun-dark ring-2 ring-sun-dark/40"}`}
                    >
                      {i + 1}
                    </span>
                    <p className="text-sm font-bold leading-tight">{step.title}</p>
                    <p className="text-xs text-ink-muted">{step.sub}</p>
                  </li>
                ))}
              </ol>
            </article>

            {/* Giáo viên */}
            <article className="flex flex-col rounded-[1.75rem] border-2 border-ink/10 bg-white p-6 md:col-span-2">
              <div className="flex -space-x-3">
                {teachers.slice(0, 4).map((t, index) => (
                  <span
                    key={t.name}
                    title={teacherLabel(t.name)}
                    className={`grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br text-sm font-bold ring-4 ring-white ${POLAROID_TONES[index % POLAROID_TONES.length]}`}
                  >
                    {initials(t.name)}
                  </span>
                ))}
                <span className="grid h-11 w-11 place-items-center rounded-full bg-sun ring-4 ring-white">
                  <Star className="h-5 w-5 fill-ink text-ink" />
                </span>
              </div>
              <h3 className="mt-5 text-lg font-bold">Giáo viên tận tâm</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                5–10 năm kinh nghiệm, bám sát chương trình cấp 2 &amp; cấp 3, quan tâm từng học sinh.
              </p>
            </article>

            {/* Học phí qua link */}
            <article className="relative overflow-hidden rounded-[1.75rem] bg-ink p-6 text-white md:col-span-2">
              <h3 className="text-lg font-bold">Học phí minh bạch</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">Mỗi học sinh một link riêng: xem số buổi, quét QR là xong.</p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white p-3 text-ink">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-soft">
                  <QrCode className="h-7 w-7 text-brand" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs text-ink-muted">
                    {sampleCourse.name} · {sampleCourse.sessionsPerMonthDefault} buổi
                  </p>
                  <p className="text-lg font-extrabold text-brand">
                    {formatCurrency(sampleCourse.pricePerSession * sampleCourse.sessionsPerMonthDefault)}
                  </p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">Đã đóng</span>
              </div>
            </article>

            {/* Phụ huynh */}
            <article className="flex flex-col rounded-[1.75rem] bg-emerald-50 p-6 md:col-span-2">
              <h3 className="text-lg font-bold">Đồng hành cùng phụ huynh</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">Trao đổi tình hình học tập thường xuyên qua Zalo.</p>
              <div className="mt-auto grid gap-2 pt-5 text-sm">
                <p className="w-fit max-w-[90%] rounded-2xl rounded-bl-md bg-white px-3.5 py-2 shadow-sm">
                  Tuần này con làm bài đầy đủ, tiến bộ phần hình học ạ.
                </p>
                <p className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-emerald-500 px-3.5 py-2 text-white shadow-sm">
                  Cảm ơn cô nhiều ạ!
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* KHÓA HỌC */}
        <section id="courses" className="scroll-mt-20 bg-canvas">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <SectionHeading
                eyebrow="Khóa học"
                title="Các lớp đang tuyển sinh"
                desc="Học phí tính theo buổi, đóng theo tháng. Liên hệ để được xếp lớp phù hợp với trình độ của con."
              />
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {COURSES.map((c) => {
                const style = inferCourseStyle(c.name);
                return (
                  <article
                    key={c.name}
                    className="group flex flex-col overflow-hidden rounded-[1.75rem] border-2 border-ink/10 bg-white transition-all duration-200 hover:-translate-y-1 hover:border-ink hover:shadow-[6px_6px_0_0_#0F172A]"
                  >
                    <div className={`relative flex h-28 items-end justify-between bg-gradient-to-br ${style.band} p-5 text-white`}>
                      <style.icon
                        aria-hidden="true"
                        className="absolute -right-3 -top-3 h-28 w-28 opacity-20 transition-transform duration-300 group-hover:rotate-12"
                        strokeWidth={1.25}
                      />
                      <h3 className="relative text-2xl font-extrabold">{c.name}</h3>
                      <span className="relative rounded-full bg-white/25 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                        Đang tuyển
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <p className="text-sm text-ink-muted">{teacherLabel(c.teacherName)}</p>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <p>
                          <span className="text-2xl font-extrabold text-ink">{formatCurrency(c.pricePerSession)}</span>
                          <span className="text-sm text-ink-muted"> /buổi</span>
                        </p>
                        <p className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-ink-muted">
                          {c.sessionsPerMonthDefault} buổi/tháng
                        </p>
                      </div>
                      <a
                        href="#contact"
                        className={`${focus} mt-5 inline-flex items-center gap-1.5 self-start rounded text-sm font-bold text-brand`}
                      >
                        Đăng ký lớp này
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </a>
                    </div>
                  </article>
                );
              })}
              <a
                href="#contact"
                className={`${focus} group relative flex flex-col justify-between overflow-hidden rounded-[1.75rem] bg-sun p-6 transition-transform hover:-rotate-1`}
              >
                <Sparkle className="absolute right-5 top-5 h-8 w-8 text-ink/20" />
                <div>
                  <p className="font-hand text-2xl">Chưa thấy lớp phù hợp?</p>
                  <p className="mt-2 text-sm leading-relaxed text-ink/75">
                    Cho trung tâm biết môn và khối lớp con cần học, chúng tôi sẽ tư vấn và mở lớp phù hợp.
                  </p>
                </div>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold">
                  Nhắn cho trung tâm
                  <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </a>
            </div>
          </div>
        </section>

        {/* GIÁO VIÊN — ẢNH POLAROID */}
        {teachers.length > 0 ? (
          <section id="teachers" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
            <SectionHeading
              eyebrow="Đội ngũ giáo viên"
              title="Thầy cô trực tiếp đứng lớp"
              desc="Giáo viên tận tâm, bám sát chương trình và đồng hành cùng học sinh trong từng buổi học."
            />
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((t, index) => {
                const subjectList = [...t.subjects];
                const profile = TEACHER_PROFILES[t.name];
                const bio = profile?.bio?.trim();
                const photo = profile?.photo?.trim();
                return (
                  <article
                    key={t.name}
                    className={`${TILTS[index % TILTS.length]} rounded-md bg-white p-3 pb-5 shadow-[0_18px_40px_-20px_rgba(30,27,75,0.45)] ring-1 ring-slate-200 transition-transform duration-300 hover:rotate-0 hover:scale-[1.02]`}
                  >
                    <div className="aspect-[4/3] overflow-hidden rounded-sm">
                      {photo ? (
                        <img src={photo} alt={teacherLabel(t.name)} className="h-full w-full object-cover" />
                      ) : (
                        <div
                          className={`grid h-full w-full place-items-center bg-gradient-to-br ${POLAROID_TONES[index % POLAROID_TONES.length]}`}
                        >
                          <span className="text-6xl font-extrabold tracking-tight opacity-80">{initials(t.name)}</span>
                        </div>
                      )}
                    </div>
                    <div className="px-2 pt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="font-hand text-3xl leading-none">{teacherLabel(t.name)}</h3>
                        <span className="shrink-0 text-xs font-semibold text-ink-muted">{t.classes} lớp</span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-brand">
                        {subjectList.length > 0 ? subjectList.join(" · ") : "Bổ trợ kiến thức"}
                      </p>
                      {bio ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">{bio}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* 4 BƯỚC */}
        <section id="steps" className="scroll-mt-20 bg-brand-deep text-white">
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
            <div className="max-w-2xl">
              <p className="font-hand text-2xl text-sun">Đăng ký</p>
              <h2 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight sm:text-[2.6rem]">
                Bắt đầu chỉ với 4 bước
              </h2>
              <p className="mt-4 text-lg text-white/70">Thủ tục đơn giản, phụ huynh nắm rõ lộ trình và học phí ngay từ đầu.</p>
            </div>
            <ol className="relative mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
              <svg
                aria-hidden="true"
                viewBox="0 0 1000 60"
                preserveAspectRatio="none"
                className="pointer-events-none absolute left-8 right-8 top-2 hidden h-14 text-sun/50 lg:block"
                fill="none"
              >
                <path
                  d="M0 30 C 120 -10, 200 70, 330 30 S 540 -10, 660 30 S 880 70, 1000 30"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeDasharray="8 10"
                  strokeLinecap="round"
                />
              </svg>
              {STEPS.map((s, i) => (
                <li key={s.title} className="relative">
                  <span
                    className={`relative grid h-16 w-16 place-items-center rounded-2xl font-hand text-4xl ${i === 2 ? "rotate-6 bg-sun text-ink" : "-rotate-3 bg-white text-brand-deep"}`}
                  >
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/70">{s.desc}</p>
                  {i === 2 ? <p className="mt-2 font-hand text-xl text-sun">← miễn phí nha!</p> : null}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* CẢM NHẬN */}
        {TESTIMONIALS.length > 0 ? (
          <section id="reviews" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
            <SectionHeading eyebrow="Phụ huynh nói gì" title="Niềm tin đến từ sự tiến bộ của con" align="center" />
            <div className="mt-12 columns-1 gap-5 sm:columns-2 lg:columns-3">
              {TESTIMONIALS.map((t, i) => (
                <figure
                  key={t.name + i}
                  className={`mb-5 break-inside-avoid rounded-[1.75rem] p-6 ${i % 3 === 1 ? "bg-sun-soft" : i % 3 === 2 ? "bg-brand-soft" : "border-2 border-ink/10 bg-white"}`}
                >
                  <Quote className="h-7 w-7 text-brand" />
                  <blockquote className="mt-3 leading-relaxed text-ink">{t.quote}</blockquote>
                  <figcaption className="mt-4 text-sm">
                    <span className="font-bold">{t.name}</span>
                    <span className="text-ink-muted"> · {t.role}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {/* HỎI ĐÁP */}
        <section
          id="faq"
          className={`mx-auto grid max-w-6xl scroll-mt-20 gap-12 px-4 py-20 sm:px-6 md:grid-cols-[1fr_1.4fr] md:py-28 ${TESTIMONIALS.length > 0 ? "pt-0 md:pt-0" : ""}`}
        >
          <div>
            <SectionHeading
              eyebrow="Hỏi đáp"
              title="Câu hỏi phụ huynh hay gặp"
              desc="Chưa thấy câu trả lời bạn cần? Gọi hoặc nhắn Zalo cho trung tâm trong giờ làm việc."
            />
            <a href={ZALO_HREF} target="_blank" rel="noopener noreferrer" className={`${btnOutline} mt-6 h-12 px-5`}>
              <MessageCircle className="h-4 w-4" />
              Hỏi qua Zalo
            </a>
          </div>
          <div className="grid gap-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-2xl border-2 border-ink/10 bg-white px-5 transition-colors open:border-ink open:shadow-[4px_4px_0_0_#0F172A]"
              >
                <summary
                  className={`${focus} flex cursor-pointer list-none items-center justify-between gap-6 rounded py-4 text-base font-bold text-ink [&::-webkit-details-marker]:hidden`}
                >
                  {f.q}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sun text-ink transition-transform duration-200 group-open:rotate-45">
                    <Plus className="h-4 w-4" strokeWidth={2.5} />
                  </span>
                </summary>
                <p className="pb-5 pr-10 leading-relaxed text-ink-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ĐĂNG KÝ + LIÊN HỆ */}
        <section id="contact" className="scroll-mt-20 px-4 pb-20 sm:px-6 md:pb-28">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] bg-brand text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:22px_22px]"
            />
            <Sparkle className="absolute left-[46%] top-10 hidden h-10 w-10 text-sun md:block" />
            <div className="relative grid gap-12 p-7 sm:p-12 md:grid-cols-2 lg:p-14">
              <div>
                <p className="font-hand text-2xl text-sun">Đăng ký &amp; tư vấn</p>
                <h2 className="mt-2 text-4xl font-extrabold leading-[1.1] tracking-tight [text-wrap:balance] sm:text-5xl">
                  Cho con học thử{" "}
                  <span className="relative inline-block whitespace-nowrap">
                    miễn phí
                    <Underline className="absolute -bottom-2 left-0 h-3.5 w-full text-sun" />
                  </span>{" "}
                  buổi đầu.
                </h2>
                <p className="mt-6 max-w-md leading-relaxed text-white/80">
                  Gọi hoặc nhắn Zalo, trung tâm sẽ tư vấn lộ trình và xếp lớp phù hợp cho con.
                </p>
                <ul className="mt-7 space-y-3 text-sm text-white/90">
                  {PERKS.map((perk) => (
                    <li key={perk} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sun text-ink">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                      {perk}
                    </li>
                  ))}
                </ul>
                <div className="mt-9 flex flex-wrap gap-3">
                  <a
                    href={ZALO_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${focusOnDark} ${pill} h-14 bg-sun px-7 text-base text-ink shadow-[0_4px_0_0_#B45309] hover:translate-y-[2px] hover:shadow-[0_2px_0_0_#B45309]`}
                  >
                    <MessageCircle className="h-5 w-5" />
                    Nhắn Zalo
                  </a>
                  <a
                    href={PHONE_HREF}
                    className={`${focusOnDark} ${pill} h-14 border-2 border-white/30 px-7 text-base text-white hover:border-white hover:bg-white/10`}
                  >
                    <Phone className="h-5 w-5" />
                    {PHONE_DISPLAY}
                  </a>
                </div>
              </div>

              <dl className="self-end rounded-3xl bg-brand-deep/60 px-5 ring-1 ring-white/10 backdrop-blur sm:px-6">
                <div className="divide-y divide-white/10">
                  <ContactRow icon={Phone} label="Điện thoại / Zalo">
                    <a href={PHONE_HREF} className="hover:text-sun">
                      {PHONE_DISPLAY}
                    </a>
                  </ContactRow>
                  <ContactRow icon={MapPin} label="Địa chỉ">
                    {CONTACT.address}
                    <a
                      href={MAPS_HREF}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 flex w-fit items-center gap-1 text-sm font-normal text-sun hover:text-white"
                    >
                      Xem bản đồ
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </ContactRow>
                  <ContactRow icon={Clock} label="Giờ làm việc">
                    {CONTACT.hours}
                  </ContactRow>
                  <ContactRow icon={Facebook} label="Facebook">
                    <a href={CONTACT.facebookUrl} target="_blank" rel="noopener noreferrer" className="hover:text-sun">
                      {CONTACT.facebookLabel}
                    </a>
                  </ContactRow>
                </div>
              </dl>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER — chừa chỗ cho thanh liên hệ cố định trên điện thoại. */}
      <footer className="bg-brand-deep pb-20 text-white/70 md:pb-0">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.5fr_1fr_1fr_1.5fr]">
          <div>
            <div className="flex items-center gap-3">
              <img src="/logo.jpg" alt="" className="h-11 w-11 rounded-full bg-white object-cover" />
              <div className="leading-tight">
                <p className="text-base font-extrabold tracking-tight text-white">APLUS ACADEMY</p>
                <p className="text-xs text-white/60">Dạy thêm cấp 2 &amp; cấp 3</p>
              </div>
            </div>
            <p className="mt-5 max-w-xs text-sm leading-relaxed">
              Bổ trợ kiến thức và luyện thi vào 10, THPT Quốc gia với giáo viên tận tâm và lộ trình rõ ràng.
            </p>
            <div className="mt-5 flex gap-2">
              {[
                { href: CONTACT.facebookUrl, label: "Facebook", icon: Facebook, external: true },
                { href: ZALO_HREF, label: "Zalo", icon: MessageCircle, external: true },
                { href: PHONE_HREF, label: "Gọi điện", icon: Phone, external: false }
              ].map((social) => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  title={social.label}
                  {...(social.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`${focusOnDark} grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-sun hover:text-ink`}
                >
                  <social.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <FooterHeading>Khóa học</FooterHeading>
            <ul className="mt-4 space-y-2.5 text-sm">
              {COURSES.map((c) => (
                <li key={c.name}>
                  <a href="#courses" className="transition-colors hover:text-sun">
                    {c.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <FooterHeading>Về trung tâm</FooterHeading>
            <ul className="mt-4 space-y-2.5 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="transition-colors hover:text-sun">
                    {item.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href="/admin" className="transition-colors hover:text-sun">
                  Đăng nhập quản trị
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <FooterHeading>Liên hệ</FooterHeading>
            <ul className="mt-4 space-y-3 text-sm">
              <li className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                <a href={MAPS_HREF} target="_blank" rel="noopener noreferrer" className="hover:text-sun">
                  {CONTACT.address}
                </a>
              </li>
              <li className="flex gap-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                <a href={PHONE_HREF} className="hover:text-sun">
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li className="flex gap-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                <a href={`mailto:${CONTACT.email}`} className="break-all hover:text-sun">
                  {CONTACT.email}
                </a>
              </li>
              <li className="flex gap-3">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                {CONTACT.hours}
              </li>
              <li className="flex gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-sun" />
                Mã số thuế: {CONTACT.taxCode}
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-white/50 sm:px-6 md:flex-row md:items-center md:justify-between">
            <p>© {year} APLUS ACADEMY. Bảo lưu mọi quyền.</p>
            <p>
              MST {CONTACT.taxCode} · {CONTACT.address}
            </p>
          </div>
        </div>
      </footer>

      {/* Thanh liên hệ nhanh cố định dưới cùng — chỉ trên điện thoại. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-2 gap-3">
          <a href={PHONE_HREF} className={`${btnOutline} h-11 px-4`}>
            <Phone className="h-4 w-4" />
            Gọi ngay
          </a>
          <a href={ZALO_HREF} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} h-11 px-4`}>
            <MessageCircle className="h-4 w-4" />
            Nhắn Zalo
          </a>
        </div>
      </div>
    </div>
  );
}
