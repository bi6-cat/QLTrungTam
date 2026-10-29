import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Gộp class Tailwind, ưu tiên class truyền vào sau (giải xung đột px-4 vs px-0, h-10 vs h-9…).
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
}) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-150 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        variant === "primary" &&
          "bg-gradient-to-b from-indigo-600 to-primary text-white shadow-sm ring-1 ring-inset ring-white/10 hover:from-indigo-700 hover:to-indigo-900 hover:shadow-md",
        variant === "secondary" &&
          "border border-stone-300 bg-white text-neutralText shadow-sm hover:border-stone-400 hover:bg-stone-50",
        variant === "accent" &&
          "bg-gradient-to-b from-amber-400 to-accent text-white shadow-sm ring-1 ring-inset ring-white/20 hover:from-amber-500 hover:to-amber-600 hover:shadow-md",
        variant === "danger" &&
          "bg-gradient-to-b from-rose-500 to-warning text-white shadow-sm ring-1 ring-inset ring-white/10 hover:from-rose-600 hover:to-rose-700 hover:shadow-md",
        variant === "ghost" && "text-neutralText hover:bg-stone-100",
        className
      )}
      {...props}
    />
  );
}

const controlBase =
  "focus-ring h-11 w-full rounded-xl border border-stone-300 bg-white px-3.5 text-sm shadow-sm transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-primary";

export function Input(props: React.ComponentProps<"input">) {
  return <input {...props} className={cn(controlBase, props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(controlBase, "cursor-pointer", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "focus-ring min-h-24 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm shadow-sm transition-colors placeholder:text-stone-400 hover:border-stone-400 focus:border-primary",
        props.className
      )}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "neutral" | "primary";
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        tone === "success" && "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
        tone === "warning" && "bg-rose-50 text-rose-700 ring-rose-600/15",
        tone === "primary" && "bg-indigo-50 text-indigo-700 ring-indigo-600/15",
        tone === "neutral" && "bg-stone-100 text-stone-700 ring-stone-500/15"
      )}
    >
      {dot ? (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "success" && "bg-emerald-500",
            tone === "warning" && "bg-rose-500",
            tone === "primary" && "bg-indigo-500",
            tone === "neutral" && "bg-stone-400"
          )}
        />
      ) : null}
      {children}
    </span>
  );
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      <span className="flex items-center justify-between gap-2">
        {label}
        {hint ? <span className="text-xs font-normal text-stone-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Panel({
  children,
  className,
  interactive = false
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-stone-200/80 bg-white p-5 shadow-soft",
        interactive && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card",
        className
      )}
    >
      {children}
    </section>
  );
}

const statTone = {
  primary: { chip: "bg-indigo-50 text-primary", value: "text-primary" },
  success: { chip: "bg-emerald-50 text-success", value: "text-success" },
  warning: { chip: "bg-rose-50 text-warning", value: "text-warning" },
  neutral: { chip: "bg-stone-100 text-stone-600", value: "text-neutralText" },
  // Tông phụ quy về màu chủ đạo để mọi tab dùng cùng một bảng màu
  // (chỉ giữ xanh lá = tốt, đỏ = cần xử lý).
  info: { chip: "bg-indigo-50 text-primary", value: "text-primary" },
  accent: { chip: "bg-indigo-50 text-primary", value: "text-primary" },
  violet: { chip: "bg-indigo-50 text-primary", value: "text-primary" },
  teal: { chip: "bg-indigo-50 text-primary", value: "text-primary" }
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral"
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  tone?: keyof typeof statTone;
}) {
  const t = statTone[tone];
  return (
    // Điện thoại: thẻ xếp 2 cột nên gọn hơn (padding, cỡ chữ, ẩn icon).
    <Panel interactive className="relative min-w-0 overflow-hidden p-3.5 sm:p-5">
      <span className="absolute inset-x-0 top-0 h-1 bg-primary" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-stone-500 sm:text-sm">{label}</p>
        {icon ? <span className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-xl sm:grid", t.chip)}>{icon}</span> : null}
      </div>
      <p className={cn("mt-2 break-words text-lg font-bold tracking-tight sm:mt-3 sm:text-2xl", t.value)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-stone-500 sm:text-sm">{hint}</p> : null}
    </Panel>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex gap-3">
        {/* Vạch màu nhấn cạnh tiêu đề trang. */}
        <span aria-hidden="true" className="mt-1 w-1.5 shrink-0 self-stretch rounded-full bg-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutralText sm:text-2xl">{title}</h1>
          {description ? <p className="mt-1 text-sm text-stone-600">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon
}: {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-stone-300 bg-white/60 p-10 text-center">
      <div>
        {icon ? (
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-stone-100 text-stone-400">
            {icon}
          </span>
        ) : null}
        <h3 className="text-base font-semibold text-neutralText">{title}</h3>
        <div className="mt-2 text-sm text-stone-600">{children}</div>
      </div>
    </div>
  );
}
