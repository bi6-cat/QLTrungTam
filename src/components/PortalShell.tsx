import Link from "next/link";
import { LogOut } from "lucide-react";
import { PortalNav, type PortalNavItem } from "@/components/PortalNav";
import { Toaster } from "@/components/Toaster";
import { Button } from "@/components/ui";

/** Khung chung của cổng giáo viên và cổng học sinh: header thương hiệu, menu tab, đăng xuất. */
export function PortalShell({
  portalName,
  greeting,
  nav,
  logoutAction,
  children
}: {
  portalName: string;
  greeting: string;
  nav: PortalNavItem[];
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/85 backdrop-blur-xl">
        <div className="h-1 bg-primary" />
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href={nav[0]?.href ?? "/"} className="focus-ring flex min-w-0 items-center gap-3 rounded-xl">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 shrink-0 rounded-xl border border-stone-200 bg-white object-cover shadow-sm"
            />
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-primary">
                APLUS ACADEMY <span className="font-semibold text-stone-400">· {portalName}</span>
              </p>
              <p className="truncate text-xs text-stone-500">{greeting}</p>
            </div>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" className="h-10 px-3">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </form>
        </div>
        <div className="mx-auto max-w-4xl px-2">
          <PortalNav items={nav} />
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl animate-fade-up gap-5 px-4 py-6">{children}</main>
      <Toaster />
    </div>
  );
}
