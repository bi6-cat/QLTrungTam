"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, FileSpreadsheet, LayoutDashboard, ReceiptText, Settings, Users } from "lucide-react";
import { clsx } from "clsx";

const nav = [
  { href: "/admin", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/admin/classes", label: "Lớp học", icon: BookOpen },
  { href: "/admin/students", label: "Học sinh", icon: Users },
  { href: "/admin/transactions", label: "Giao dịch", icon: ReceiptText },
  { href: "/admin/reports", label: "Báo cáo", icon: FileSpreadsheet },
  { href: "/admin/settings", label: "Cài đặt", icon: Settings }
];

export function AdminNav() {
  const pathname = usePathname();
  const [optimisticHref, setOptimisticHref] = useState<string | null>(null);
  const isNavigating = optimisticHref !== null;

  useEffect(() => {
    setOptimisticHref(null);
  }, [pathname]);

  const activeHref = useMemo(() => {
    if (optimisticHref) return optimisticHref;
    const match = nav
      .filter((item) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href)))
      .sort((a, b) => b.href.length - a.href.length)[0];
    return match?.href ?? "/admin";
  }, [optimisticHref, pathname]);

  return (
    <>
      {isNavigating ? (
        <div className="fixed left-0 top-0 z-50 h-1 w-full overflow-hidden bg-indigo-100">
          <div className="route-progress h-full bg-accent" />
        </div>
      ) : null}
      <nav className="grid gap-1.5">
        {nav.map((item) => {
          const Icon = item.icon;
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={() => setOptimisticHref(item.href)}
              className={clsx(
                "focus-ring group relative flex h-11 items-center gap-3 overflow-hidden rounded-md px-3 text-sm font-semibold transition duration-150",
                isActive
                  ? "translate-x-1 bg-indigo-50 text-primary shadow-sm ring-1 ring-indigo-100"
                  : "text-stone-700 hover:translate-x-0.5 hover:bg-stone-50 hover:text-neutralText"
              )}
            >
              <span
                className={clsx(
                  "absolute left-0 top-2 h-7 w-1 rounded-r-full transition-all",
                  isActive ? "bg-accent opacity-100" : "bg-transparent opacity-0"
                )}
              />
              <span
                className={clsx(
                  "grid h-7 w-7 place-items-center rounded-md transition",
                  isActive ? "bg-primary text-white" : "bg-stone-100 text-primary group-hover:bg-indigo-100"
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
