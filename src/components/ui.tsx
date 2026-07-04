import { clsx } from "clsx";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "accent" | "danger" | "ghost";
}) {
  return (
    <button
      className={clsx(
        "focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-primary text-white shadow-sm hover:bg-indigo-800",
        variant === "secondary" && "border border-stone-300 bg-white text-neutralText shadow-sm hover:bg-stone-50",
        variant === "accent" && "bg-accent text-white hover:bg-amber-600",
        variant === "danger" && "bg-warning text-white hover:bg-rose-600",
        variant === "ghost" && "text-neutralText hover:bg-stone-100",
        className
      )}
      {...props}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        "focus-ring h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm transition placeholder:text-stone-400 hover:border-stone-400",
        props.className
      )}
      {...props}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={clsx(
        "focus-ring h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm transition hover:border-stone-400",
        props.className
      )}
      {...props}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={clsx(
        "focus-ring min-h-20 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm",
        props.className
      )}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "neutral" | "primary";
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tone === "success" && "bg-emerald-50 text-emerald-700",
        tone === "warning" && "bg-rose-50 text-rose-700",
        tone === "primary" && "bg-indigo-50 text-indigo-700",
        tone === "neutral" && "bg-stone-100 text-stone-700"
      )}
    >
      {children}
    </span>
  );
}

export function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-stone-700">
      {label}
      {children}
    </label>
  );
}

export function Panel({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx("rounded-lg border border-stone-200 bg-white p-5 shadow-soft", className)}>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-stone-300 bg-white p-10 text-center">
      <div>
        <h3 className="text-base font-semibold text-neutralText">{title}</h3>
        <div className="mt-2 text-sm text-stone-600">{children}</div>
      </div>
    </div>
  );
}
