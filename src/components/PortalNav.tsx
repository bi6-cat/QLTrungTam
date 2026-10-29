"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, UserRound } from "lucide-react";
import { clsx } from "clsx";

// Icon chọn theo tên vì component icon không truyền được từ server component sang đây.
const ICONS = { classes: BookOpen, tasks: ClipboardList, account: UserRound } as const;

export type PortalNavItem = { href: string; label: string; icon: keyof typeof ICONS };

export function PortalNav({ items }: { items: PortalNavItem[] }) {
  const pathname = usePathname();
  // Mục dài nhất khớp đường dẫn là mục đang mở (mục gốc chỉ khớp đúng chính nó).
  const active = items
    .filter((item) => pathname === item.href || (item !== items[0] && pathname.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <nav className="scrollbar-none flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const Icon = ICONS[item.icon];
        const current = item === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={clsx(
              "focus-ring -mb-px inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors",
              current ? "border-primary text-primary" : "border-transparent text-stone-500 hover:text-neutralText"
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
