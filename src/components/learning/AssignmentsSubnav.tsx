import Link from "next/link";
import { clsx } from "clsx";

/**
 * Thanh chuyển trong tab "Bài tập": bài đã giao và (nếu giáo viên được bật) bộ từ vựng. Giáo viên
 * không dạy ngoại ngữ chỉ có một mục nên không hiện thanh này.
 */
export function AssignmentsSubnav({ active, vocabEnabled }: { active: "assignments" | "vocab"; vocabEnabled: boolean }) {
  if (!vocabEnabled) return null;
  const items = [
    { key: "assignments", href: "/teacher/assignments", label: "Bài đã giao" },
    { key: "vocab", href: "/teacher/vocab", label: "Bộ từ vựng" }
  ] as const;
  return (
    <nav className="flex w-fit gap-1 rounded-xl bg-stone-100 p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={clsx(
            "focus-ring rounded-lg px-3 py-1.5 text-sm font-semibold transition",
            active === item.key ? "bg-white text-neutralText shadow-sm" : "text-stone-500 hover:text-neutralText"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
