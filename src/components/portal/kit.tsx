import Link from "next/link";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Gộp class và để class truyền vào thắng class mặc định (vd p-0 thay p-5). */
const cx = (...inputs: Parameters<typeof clsx>) => twMerge(clsx(inputs));

// Bộ khối giao diện chung của cổng giáo viên và cổng học sinh. Không dùng hook nên dùng được cả ở
// server component lẫn client component.

export type Tone = "indigo" | "violet" | "amber" | "emerald" | "rose" | "sky" | "stone";

const TONE: Record<Tone, { soft: string; text: string; solid: string; ring: string }> = {
  indigo: { soft: "bg-indigo-50", text: "text-indigo-700", solid: "bg-indigo-600", ring: "ring-indigo-600/15" },
  violet: { soft: "bg-violet-50", text: "text-violet-700", solid: "bg-violet-500", ring: "ring-violet-600/15" },
  amber: { soft: "bg-amber-50", text: "text-amber-700", solid: "bg-amber-500", ring: "ring-amber-600/20" },
  emerald: { soft: "bg-emerald-50", text: "text-emerald-700", solid: "bg-emerald-500", ring: "ring-emerald-600/15" },
  rose: { soft: "bg-rose-50", text: "text-rose-700", solid: "bg-rose-500", ring: "ring-rose-600/15" },
  sky: { soft: "bg-sky-50", text: "text-sky-700", solid: "bg-sky-500", ring: "ring-sky-600/15" },
  stone: { soft: "bg-stone-100", text: "text-stone-600", solid: "bg-stone-400", ring: "ring-stone-500/15" }
};

export const toneClass = (tone: Tone) => TONE[tone];

// ---------------------------------------------------------------------------
// Nút dạng link (Link không dùng được <Button>)
// ---------------------------------------------------------------------------

const buttonBase =
  "focus-ring inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:scale-[0.98]";

export const linkButton = {
  primary: clsx(buttonBase, "bg-gradient-to-b from-indigo-600 to-primary text-white shadow-sm shadow-indigo-900/20 hover:from-indigo-700 hover:to-indigo-900"),
  secondary: clsx(buttonBase, "border border-stone-200 bg-white text-neutralText shadow-sm hover:border-stone-300 hover:bg-stone-50"),
  light: clsx(buttonBase, "bg-white/15 text-white ring-1 ring-inset ring-white/25 backdrop-blur hover:bg-white/25"),
  white: clsx(buttonBase, "bg-white text-primary shadow-sm hover:bg-indigo-50")
};

// ---------------------------------------------------------------------------
// Khung trang
// ---------------------------------------------------------------------------

export function PageIntro({
  eyebrow,
  title,
  subtitle,
  actions,
  back
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {back ? (
          <Link href={back.href} className="focus-ring mb-2 inline-flex items-center gap-1 rounded-lg text-sm font-medium text-stone-500 hover:text-primary">
            <span aria-hidden="true">←</span> {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm text-stone-500">{eyebrow}</div> : null}
        <h1 className="text-2xl font-bold tracking-tight text-neutralText sm:text-[1.75rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm text-stone-600 sm:text-base">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Card({ className, children, interactive = false }: { className?: string; children: React.ReactNode; interactive?: boolean }) {
  return (
    <section
      className={cx(
        "rounded-3xl border border-stone-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] sm:p-6",
        interactive && "transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-[0_2px_4px_rgba(15,23,42,0.05),0_18px_36px_-16px_rgba(55,48,163,0.28)]",
        className
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-bold text-neutralText sm:text-lg">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="focus-ring inline-flex items-center gap-1 rounded-lg text-sm font-semibold text-primary hover:underline">
      {children} <span aria-hidden="true">→</span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Số liệu
// ---------------------------------------------------------------------------

export function StatTile({
  icon,
  label,
  value,
  hint,
  tone = "indigo"
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: Tone;
}) {
  const t = TONE[tone];
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", t.soft, t.text)}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-stone-500">{label}</p>
        <p className="text-xl font-bold tabular-nums tracking-tight text-neutralText">{value}</p>
        {hint ? <p className="truncate text-xs text-stone-500">{hint}</p> : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value, max, tone = "indigo", className }: { value: number; max: number; tone?: Tone; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-stone-100", className)} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      <div className={clsx("h-full rounded-full transition-all", TONE[tone].solid)} style={{ width: `${percent}%` }} />
    </div>
  );
}

/** Vòng tiến độ SVG; `ratio` từ 0 đến 1. */
export function ProgressRing({
  ratio,
  size = 72,
  stroke = 8,
  tone = "indigo",
  children
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  tone?: Tone;
  children?: React.ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, ratio));
  const color = { indigo: "#4f46e5", violet: "#8b5cf6", amber: "#f59e0b", emerald: "#10b981", rose: "#f43f5e", sky: "#0ea5e9", stone: "#a8a29e" }[tone];
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Màu theo tỉ lệ đúng: giỏi xanh lá, khá chàm, trung bình vàng, yếu đỏ. */
export function scoreTone(ratio: number): Tone {
  if (ratio >= 0.85) return "emerald";
  if (ratio >= 0.65) return "indigo";
  if (ratio >= 0.5) return "amber";
  return "rose";
}

export function ScorePill({ score, max }: { score: number; max: number }) {
  const t = TONE[scoreTone(max ? score / max : 0)];
  return (
    <span className={clsx("inline-flex items-center rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ring-1 ring-inset", t.soft, t.text, t.ring)}>
      {score}/{max}
    </span>
  );
}

export function Chip({ tone = "stone", icon, children, className }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  const t = TONE[tone];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", t.soft, t.text, t.ring, className)}>
      {icon}
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Avatar chữ cái đầu
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-400 to-orange-500",
  "from-rose-400 to-pink-500",
  "from-fuchsia-500 to-purple-500",
  "from-teal-500 to-cyan-500",
  "from-orange-400 to-rose-500"
];

/** Chữ cái đầu của tên gọi (từ cuối) và họ: "Nguyễn Văn Hương" → "HN". */
export function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const last = words.at(-1)!;
  return (last[0] + (words.length > 1 ? words[0][0] : last[1] ?? "")).toUpperCase();
}

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow-sm",
        AVATAR_COLORS[hash % AVATAR_COLORS.length],
        size === "sm" && "h-8 w-8 text-[11px]",
        size === "md" && "h-10 w-10 text-xs",
        size === "lg" && "h-12 w-12 text-sm",
        size === "xl" && "h-20 w-20 text-xl",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Trạng thái trống
// ---------------------------------------------------------------------------

export function EmptyBlock({ icon, title, children, action }: { icon: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-dashed border-stone-300 bg-white/70 px-6 py-12 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute -top-16 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-indigo-100/60 blur-3xl" />
      <span className="relative mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 text-primary ring-1 ring-inset ring-indigo-100">
        {icon}
      </span>
      <p className="relative font-semibold text-neutralText">{title}</p>
      {children ? <div className="relative mx-auto mt-1 max-w-md text-sm text-stone-500">{children}</div> : null}
      {action ? <div className="relative mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
