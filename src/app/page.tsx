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
  tutoring: "" // Ảnh giờ chữa bài trên lớp, ngang 4:3 (VD "/photos/chua-bai.jpg"); trống thì hiện hình vẽ
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

/**
 * "Vì sao chọn": 4 điều viết như lời thầy cô nói với phụ huynh.
 * 👉 Sửa câu chữ ở đây cho đúng cách trung tâm đang dạy.
 */
const REASONS = [
  {
    title: "Con chưa hiểu, cô giảng lại.",
    desc: "Thắc mắc chỗ nào cứ hỏi, cô giảng lại đến khi hiểu. Hỏi lại mấy lần cũng được, không ai cười."
  },
  {
    title: "Bài về nhà được chữa đàng hoàng.",
    desc: "Đầu buổi chữa bài cũ, sai chỗ nào sửa chỗ đó, rồi mới sang bài mới."
  },
  {
    title: "Học đúng thứ con đang cần.",
    desc: "Hổng nền thì lấp nền trước. Sắp thi vào 10 hay THPT thì luyện đề theo dạng."
  },
  {
    title: "Bố mẹ luôn biết con học thế nào.",
    desc: "Có gì cô nhắn Zalo. Học phí xem qua link riêng, quét QR là xong."
  }
] as const;

const STEPS = [
  { title: "Liên hệ tư vấn", desc: "Gọi điện, nhắn Zalo hoặc Facebook để trung tâm nắm nhu cầu của con." },
  { title: "Kiểm tra trình độ", desc: "Đánh giá nhanh kiến thức hiện tại để tư vấn lộ trình phù hợp." },
  { title: "Học thử buổi đầu", desc: "Con học thử buổi đầu tiên, làm quen với thầy cô và lớp học." },
  { title: "Vào lớp chính thức", desc: "Nhận lịch học và đường link học phí riêng để phụ huynh tiện theo dõi." }
] as const;

const PERKS = [
  "Thầy cô nhiều năm kinh nghiệm, dạy bám sát chương trình mới",
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
 * Minh họa giờ chữa bài: cô giáo chỉ lên bảng phấn, một bạn giơ tay hỏi, các bạn khác chép bài.
 * Dùng trong khung ảnh của phần "Vì sao chọn" khi chưa có ảnh thật.
 */
function ClassroomIllustration({ className = "" }: { className?: string }) {
  const hand = { fontFamily: "var(--font-hand), 'Comic Sans MS', cursive" };
  const skin = "#F6CBA5";
  const hair = "#1F2937";
  return (
    <svg role="img" aria-label="Minh họa giờ chữa bài trên lớp" viewBox="0 0 480 360" className={className}>
      {/* tường + sàn */}
      <rect width="480" height="360" fill="#EEF2FF" />
      <rect y="268" width="480" height="92" fill="#E0E7FF" />
      {/* cửa sổ có nắng */}
      <rect x="24" y="34" width="86" height="96" rx="8" fill="#FFFFFF" />
      <path d="M67 34 v96 M24 82 h86" stroke="#C7D2FE" strokeWidth="4" />
      <path d="M24 130 L 0 268 L 60 268 L 110 130 Z" fill="#FDE68A" opacity="0.35" />

      {/* bảng phấn */}
      <rect x="196" y="30" width="262" height="156" rx="10" fill="#B7834A" />
      <rect x="206" y="40" width="242" height="136" rx="6" fill="#24604A" />
      <text x="224" y="78" fill="#FFFFFF" fontSize="24" style={hand}>2x + 5 = 11</text>
      <text x="224" y="112" fill="#FFFFFF" fillOpacity="0.8" fontSize="24" style={hand}>2x = 6</text>
      <text x="224" y="148" fill="#FDE68A" fontSize="28" style={hand}>x = 3</text>
      <path d="M316 136 l9 9 l20 -24" stroke="#FBBF24" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="224" y="186" width="200" height="7" rx="3.5" fill="#8C5F31" />

      {/* cô giáo */}
      <g>
        <rect x="150" y="196" width="44" height="74" rx="10" fill="#4338CA" />
        <rect x="154" y="262" width="12" height="20" rx="4" fill="#1E1B4B" />
        <rect x="178" y="262" width="12" height="20" rx="4" fill="#1E1B4B" />
        <path d="M144 150 q28 -10 56 0 v56 q-28 10 -56 0 z" fill="#FBBF24" />
        {/* tay chỉ lên bảng */}
        <path d="M194 160 L 236 120" stroke="#FBBF24" strokeWidth="13" strokeLinecap="round" />
        <circle cx="240" cy="116" r="7" fill={skin} />
        <path d="M150 164 L 140 200" stroke="#FBBF24" strokeWidth="12" strokeLinecap="round" />
        <circle cx="139" cy="204" r="6" fill={skin} />
        <rect x="165" y="132" width="14" height="14" rx="4" fill={skin} />
        <circle cx="172" cy="116" r="22" fill={skin} />
        <path d="M150 114 a22 22 0 0 1 44 0 q-8 -10 -22 -8 q-14 -2 -22 8 z" fill={hair} />
        <circle cx="190" cy="100" r="9" fill={hair} />
        <circle cx="165" cy="118" r="2.2" fill={hair} />
        <circle cx="180" cy="118" r="2.2" fill={hair} />
        <path d="M166 127 q6 5 12 0" stroke="#B45309" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      </g>

      {/* bàn học sinh */}
      <rect x="0" y="292" width="480" height="16" rx="4" fill="#E9B872" />
      <rect x="0" y="306" width="480" height="54" fill="#D9A35C" />

      {/* học sinh 1: giơ tay hỏi */}
      <g>
        <path d="M44 300 q0 -46 40 -46 q40 0 40 46 z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
        <path d="M106 268 L 120 196" stroke="#CBD5E1" strokeWidth="19" strokeLinecap="round" />
        <path d="M106 268 L 120 196" stroke="#FFFFFF" strokeWidth="15" strokeLinecap="round" />
        <circle cx="121" cy="188" r="9" fill={skin} />
        <circle cx="84" cy="230" r="24" fill={hair} />
        <rect x="58" y="226" width="52" height="10" rx="5" fill={hair} />
        {/* bong bóng hỏi */}
        <rect x="34" y="150" width="42" height="36" rx="12" fill="#FFFFFF" stroke="#C7D2FE" strokeWidth="2" />
        <path d="M66 184 l10 14 l-2 -14 z" fill="#FFFFFF" />
        <text x="47" y="177" fill="#4338CA" fontSize="24" fontWeight="800">?</text>
      </g>

      {/* học sinh 2 + 3: cúi chép bài */}
      <g>
        <path d="M222 300 q0 -40 36 -40 q36 0 36 40 z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
        <circle cx="258" cy="244" r="21" fill={hair} />
        <path d="M244 254 q14 10 28 0" stroke={hair} strokeWidth="6" />
        <circle cx="276" cy="232" r="7" fill={hair} />
      </g>
      <g>
        <path d="M352 300 q0 -42 38 -42 q38 0 38 42 z" fill="#FFFFFF" stroke="#E2E8F0" strokeWidth="2" />
        <circle cx="390" cy="240" r="22" fill={hair} />
        <rect x="364" y="236" width="52" height="9" rx="4.5" fill={hair} />
      </g>

      {/* vở + bút trên bàn */}
      <rect x="300" y="282" width="46" height="14" rx="3" fill="#FFFFFF" transform="rotate(-4 323 289)" />
      <rect x="306" y="276" width="40" height="5" rx="2.5" fill="#F43F5E" transform="rotate(-18 326 278)" />
      <rect x="172" y="284" width="38" height="12" rx="3" fill="#C7D2FE" transform="rotate(3 191 290)" />

      {/* lấp lánh */}
      <path d="M128 52 c1.5 8 4 10.5 12 12 c-8 1.5 -10.5 4 -12 12 c-1.5 -8 -4 -10.5 -12 -12 c8 -1.5 10.5 -4 12 -12 z" fill="#FBBF24" />
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
                Quốc gia, bám sát chương trình mới, với thầy cô nhiều năm kinh nghiệm.
              </p>
              <div className="relative mt-9 flex flex-wrap items-center gap-3">
                <a href="#contact" className={`${btnPrimary} h-14 px-7 text-base`}>
                  Đăng ký tư vấn
                  <ArrowRight className="h-5 w-5" />
                </a>
                <a href="#courses" className={`${btnOutline} h-14 px-7 text-base`}>
                  Xem khóa học
                </a>
                <div className="pointer-events-none absolute -bottom-16 left-40 hidden items-end gap-1 text-brand sm:flex">
                  <CurvyArrow className="h-12 w-16 -scale-x-100 -rotate-[160deg]" />
                  <span className="font-hand text-xl">thầy cô nhiều năm đứng lớp!</span>
                </div>
              </div>
              <ul className="mt-16 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted sm:mt-20">
                {PERKS.slice(0, 3).map((perk) => (
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

              <div className="absolute -right-2 -top-6 grid h-28 w-28 rotate-12 animate-float place-items-center rounded-full bg-sun text-center shadow-lg motion-reduce:animate-none sm:-right-6">
                <p className="font-hand text-lg leading-5 text-ink">
                  Bám sát
                  <br />
                  chương trình
                  <br />
                  mới
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

        {/* VÌ SAO CHỌN — TRANG VỞ CỦA CÔ */}
        <section id="why" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 md:py-28">
          <SectionHeading
            eyebrow="Vì sao chọn APLUS?"
            title="Mấy điều tụi mình luôn giữ, từ buổi học đầu tiên."
          />

          <div className="mt-12 grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
            {/* Trang vở kẻ dòng, lề đỏ */}
            <div className="paper-ruled relative rounded-2xl py-6 pl-16 pr-6 shadow-[0_24px_50px_-28px_rgba(30,27,75,0.5)] ring-1 ring-slate-200 sm:py-8 sm:pl-24 sm:pr-8">
              <ol className="grid gap-7 text-base leading-9 sm:text-[17px]">
                {REASONS.map((reason, index) => (
                  <li key={reason.title} className="relative">
                    <span className="absolute -left-12 top-0 font-hand text-3xl leading-9 text-rose-500 sm:-left-16">
                      {index + 1}.
                    </span>
                    <p className="font-bold">{reason.title}</p>
                    <p className="text-ink-muted">{reason.desc}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-right font-hand text-2xl text-brand">— Thầy cô APLUS</p>
            </div>

            {/* Ảnh dán băng keo + giấy note */}
            <div className="grid content-start gap-8">
              <figure className="tape-strip relative rotate-2 rounded-md bg-white p-3 pb-4 shadow-[0_18px_40px_-20px_rgba(30,27,75,0.45)] ring-1 ring-slate-200">
                <div className="aspect-[4/3] overflow-hidden rounded-sm">
                  {PHOTOS.tutoring ? (
                    <img src={PHOTOS.tutoring} alt="Giờ chữa bài trên lớp" className="h-full w-full object-cover" />
                  ) : (
                    <ClassroomIllustration className="h-full w-full" />
                  )}
                </div>
                <figcaption className="mt-3 text-center font-hand text-xl text-ink">Giờ chữa bài trên lớp</figcaption>
              </figure>
              <div className="-rotate-2 rounded-md bg-sun-soft p-5 shadow-md">
                <p className="font-hand text-2xl leading-7 text-ink">
                  Thầy cô 5–10 năm đứng lớp, dạy bám sát chương trình giáo dục phổ thông mới.
                </p>
                <a href="#teachers" className={`${focus} mt-3 inline-flex items-center gap-1 rounded text-sm font-bold text-brand`}>
                  Xem đội ngũ giáo viên
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
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
