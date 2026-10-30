"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, FolderOpen, LayoutDashboard, UserRound } from "lucide-react";
import { clsx } from "clsx";

// Icon chọn theo tên vì component icon không truyền được từ server component sang đây.
const ICONS = { home: LayoutDashboard, classes: BookOpen, tasks: ClipboardList, materials: FolderOpen, account: UserRound } as const;

/** `match`: các đường dẫn khác cũng tính là đang ở mục này (vd trang con nằm ngoài `href`). */
export type PortalNavItem = { href: string; label: string; icon: keyof typeof ICONS; match?: string[] };

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** Mục dài nhất khớp đường dẫn là mục đang mở (mục gốc chỉ khớp đúng chính nó). */
function useActive(items: PortalNavItem[]) {
  const pathname = usePathname();
  const active = items
    .filter(
      (item) =>
        pathname === item.href ||
        (item !== items[0] && pathname.startsWith(`${item.href}/`)) ||
        item.match?.some((prefix) => under(pathname, prefix))
    )
    .sort((a, b) => b.href.length - a.href.length)[0];
  return { active, pathname };
}

/** Menu dọc ở thanh bên (màn hình rộng). */
export function SidebarNav({ items }: { items: PortalNavItem[] }) {
  const { active } = useActive(items);
  return (
    <nav className="grid gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const current = item === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={clsx(
              "focus-ring group relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition",
              current ? "bg-indigo-50 text-primary" : "text-stone-500 hover:bg-stone-100/80 hover:text-neutralText"
            )}
          >
            {current ? <span aria-hidden="true" className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" /> : null}
            <Icon className={clsx("h-[18px] w-[18px]", current ? "text-primary" : "text-stone-400 group-hover:text-stone-600")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Thanh tab dưới đáy (điện thoại), như ứng dụng. Ẩn khi đang làm bài: trang làm bài có thanh nộp
 * bài riêng ở đáy và nên tập trung.
 */
export function BottomNav({ items, hideOn = [] }: { items: PortalNavItem[]; hideOn?: string[] }) {
  const { active, pathname } = useActive(items);
  if (hideOn.some((prefix) => under(pathname, prefix))) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((item) => {
          const Icon = ICONS[item.icon];
          const current = item === active;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={clsx("focus-ring flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", current ? "text-primary" : "text-stone-400")}
            >
              <span className={clsx("grid h-8 w-12 place-items-center rounded-full transition", current && "bg-indigo-50")}>
                <Icon className="h-5 w-5" />
              </span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
