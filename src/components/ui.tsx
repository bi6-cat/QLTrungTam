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
        "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary text-white hover:bg-indigo-900",
        variant === "secondary" && "border border-stone-300 bg-white text-neutralText hover:bg-stone-50",
        variant === "accent" && "bg-amber-500 text-white hover:bg-amber-600",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "ghost" && "text-neutralText hover:bg-stone-100",
        className
      )}
      {...props}
    />
  );
}

// Ô nhập phẳng, viền mảnh; khi gõ thì viền màu chủ đạo + quầng nhạt (không đổ bóng, không bo quá tròn).
const controlBase =
  "h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-neutralText outline-none transition-[border-color,box-shadow] placeholder:text-stone-400 hover:border-stone-400 focus:border-primary focus:ring-[3px] focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-stone-50 disabled:text-stone-500";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
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
        controlBase,
        "h-auto min-h-24 py-2 leading-relaxed",
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

/**
 * Một ô trong form: nhãn ở trên, "không bắt buộc" ghi nhỏ cạnh nhãn, gợi ý nằm dưới ô (không chen
 * vào dòng nhãn nên nhãn không bị xuống dòng).
 */
export function Field({
  label,
  children,
  hint,
  optional = false,
  required = false,
  className
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  optional?: boolean;
  /** Chỉ để hiện dấu * cạnh nhãn; ràng buộc thật vẫn đặt ở ô nhập. */
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("grid content-start gap-1.5", className)}>
      <span className="text-[13px] font-semibold text-stone-800">
        {label}
        {required ? <span className="ml-0.5 text-rose-600">*</span> : null}
        {optional ? <span className="ml-1.5 text-xs font-normal text-stone-400">không bắt buộc</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs leading-snug text-stone-500">{hint}</span> : null}
    </label>
  );
}

/** Nhóm ô trong form có tiêu đề nhỏ, vd "Học sinh", "Phụ huynh". */
export function FormSection({
  title,
  children,
  className
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn("grid gap-3 sm:grid-cols-2", className)}>
      <legend className="mb-2.5 flex w-full items-center gap-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
        {title}
        <span className="h-px flex-1 bg-stone-200" />
      </legend>
      {children}
    </fieldset>
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
