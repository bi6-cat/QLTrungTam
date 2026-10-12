"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  LayoutDashboard,
  PiggyBank,
  ReceiptText,
  Settings,
  Users,
  Wallet
} from "lucide-react";
import { clsx } from "clsx";
import type { AdminRole } from "@/lib/roles";

// Mỗi mục một màu riêng để dễ nhận ra khi lướt menu (class viết đủ để Tailwind giữ lại).
const TONES = {
  indigo: { tile: "bg-indigo-50 text-indigo-600 group-hover:bg-indigo-100", active: "from-indigo-500 to-indigo-700", ring: "bg-indigo-50/80 text-indigo-800 ring-indigo-100" },
  sky: { tile: "bg-sky-50 text-sky-600 group-hover:bg-sky-100", active: "from-sky-500 to-sky-700", ring: "bg-sky-50/80 text-sky-800 ring-sky-100" },
  teal: { tile: "bg-teal-50 text-teal-600 group-hover:bg-teal-100", active: "from-teal-500 to-teal-700", ring: "bg-teal-50/80 text-teal-800 ring-teal-100" },
  violet: { tile: "bg-violet-50 text-violet-600 group-hover:bg-violet-100", active: "from-violet-500 to-violet-700", ring: "bg-violet-50/80 text-violet-800 ring-violet-100" },
  rose: { tile: "bg-rose-50 text-rose-600 group-hover:bg-rose-100", active: "from-rose-500 to-rose-700", ring: "bg-rose-50/80 text-rose-800 ring-rose-100" },
  cyan: { tile: "bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100", active: "from-cyan-500 to-cyan-700", ring: "bg-cyan-50/80 text-cyan-800 ring-cyan-100" },
  emerald: { tile: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100", active: "from-emerald-500 to-emerald-700", ring: "bg-emerald-50/80 text-emerald-800 ring-emerald-100" },
  amber: { tile: "bg-amber-50 text-amber-600 group-hover:bg-amber-100", active: "from-amber-400 to-amber-600", ring: "bg-amber-50/80 text-amber-800 ring-amber-100" },
  fuchsia: { tile: "bg-fuchsia-50 text-fuchsia-600 group-hover:bg-fuchsia-100", active: "from-fuchsia-500 to-fuchsia-700", ring: "bg-fuchsia-50/80 text-fuchsia-800 ring-fuchsia-100" },
  slate: { tile: "bg-slate-100 text-slate-600 group-hover:bg-slate-200", active: "from-slate-500 to-slate-700", ring: "bg-slate-100/80 text-slate-800 ring-slate-200" }
} as const;

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; tone: keyof typeof TONES };

const NAV_ITEMS: Record<string, NavItem> = {
  dashboard: { href: "/admin", label: "Tổng quan", icon: LayoutDashboard, tone: "indigo" },
  classes: { href: "/admin/classes", label: "Lớp học", icon: BookOpen, tone: "sky" },
  students: { href: "/admin/students", label: "Học sinh", icon: Users, tone: "teal" },
  schedule: { href: "/admin/schedule", label: "Thời khóa biểu", icon: CalendarDays, tone: "violet" },
  debts: { href: "/admin/debts", label: "Công nợ", icon: Wallet, tone: "rose" },
  transactions: { href: "/admin/transactions", label: "Giao dịch", icon: ReceiptText, tone: "cyan" },
  finance: { href: "/admin/finance", label: "Thu chi", icon: PiggyBank, tone: "emerald" },
  salary: { href: "/admin/salary", label: "Lương GV", icon: Banknote, tone: "amber" },
  reports: { href: "/admin/reports", label: "Báo cáo", icon: FileSpreadsheet, tone: "fuchsia" },
  settings: { href: "/admin/settings", label: "Cài đặt", icon: Settings, tone: "slate" }
};

const ownerNav: NavItem[] = [
  NAV_ITEMS.dashboard,
  NAV_ITEMS.classes,
  NAV_ITEMS.students,
  NAV_ITEMS.schedule,
  NAV_ITEMS.debts,
  NAV_ITEMS.transactions,
  NAV_ITEMS.finance,
  NAV_ITEMS.salary,
  NAV_ITEMS.reports,
  NAV_ITEMS.settings
];

// Phải khớp với canAccessAdminPath trong @/lib/roles.
const managerNav: NavItem[] = [
  NAV_ITEMS.dashboard,
  NAV_ITEMS.classes,
  NAV_ITEMS.students,
  NAV_ITEMS.schedule,
  NAV_ITEMS.debts,
  NAV_ITEMS.transactions,
  NAV_ITEMS.reports,
  { ...NAV_ITEMS.settings, label: "Tài khoản" }
];

export function AdminNav({ role }: { role: AdminRole }) {
  const nav = role === "manager" ? managerNav : ownerNav;
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
  }, [nav, optimisticHref, pathname]);

  return (
    <>
      {isNavigating ? (
        <div className="fixed left-0 top-0 z-50 h-1 w-full overflow-hidden bg-indigo-100">
          <div className="route-progress h-full bg-accent" />
        </div>
      ) : null}
      <p className="px-3 pb-2 pt-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">Điều hướng</p>
      <nav className="grid gap-1">
        {nav.map((item) => {
          const Icon = item.icon;
          const tone = TONES[item.tone];
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOptimisticHref(item.href)}
              className={clsx(
                "focus-ring group relative flex h-11 items-center gap-3 overflow-hidden rounded-xl px-3 text-sm font-semibold transition-all duration-150",
                isActive ? `${tone.ring} shadow-sm ring-1` : "text-stone-700 hover:bg-stone-100/80 hover:text-neutralText"
              )}
            >
              <span
                className={clsx(
                  "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b transition-all duration-200",
                  isActive ? `${tone.active} opacity-100` : "opacity-0"
                )}
              />
              <span
                className={clsx(
                  "grid h-8 w-8 place-items-center rounded-lg transition-colors",
                  isActive ? `bg-gradient-to-br ${tone.active} text-white shadow-sm` : tone.tile
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
