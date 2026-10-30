import Link from "next/link";
import { LogOut } from "lucide-react";
import { BottomNav, SidebarNav, type PortalNavItem } from "@/components/PortalNav";
import { Avatar } from "@/components/portal/kit";
import { Toaster } from "@/components/Toaster";

/**
 * Khung chung của cổng giáo viên và cổng học sinh: thanh bên (màn hình rộng) với menu và thẻ người
 * dùng; trên điện thoại là thanh trên gọn và thanh tab dưới đáy.
 */
export function PortalShell({
  portalName,
  user,
  nav,
  logoutAction,
  hideBottomNavOn,
  children
}: {
  portalName: string;
  user: { name: string; detail: string };
  nav: PortalNavItem[];
  logoutAction: () => Promise<void>;
  /** Đường dẫn ẩn thanh tab dưới đáy (vd trang làm bài có thanh nộp bài riêng). */
  hideBottomNavOn?: string[];
  children: React.ReactNode;
}) {
  const home = nav[0]?.href ?? "/";
  return (
    <div className="min-h-screen bg-[#f6f7fb] lg:grid lg:grid-cols-[264px_minmax(0,1fr)]">
      {/* Nền và viền nằm ở cột (cao bằng cả trang), phần menu dính ở đầu màn hình khi cuộn. */}
      <div className="hidden border-r border-stone-200/70 bg-white/80 lg:block">
        <aside className="sticky top-0 flex h-screen flex-col px-4 py-5">
          <Brand href={home} portalName={portalName} />
          <div className="mt-8 flex-1">
            <SidebarNav items={nav} />
          </div>
          <div className="rounded-2xl border border-stone-200/70 bg-stone-50/80 p-3">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-neutralText">{user.name}</p>
                <p className="truncate text-xs text-stone-500">{user.detail}</p>
              </div>
            </div>
            <form action={logoutAction} className="mt-3">
              <button
                type="submit"
                className="focus-ring flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white text-sm font-semibold text-stone-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <LogOut className="h-4 w-4" />
                Đăng xuất
              </button>
            </form>
          </div>
        </aside>
      </div>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-stone-200/70 bg-white/85 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <Brand href={home} portalName={portalName} compact />
          <div className="flex items-center gap-2">
            <Avatar name={user.name} size="sm" />
            <form action={logoutAction}>
              <button type="submit" aria-label="Đăng xuất" className="focus-ring grid h-9 w-9 place-items-center rounded-xl text-stone-500 hover:bg-stone-100">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </header>
        <main className="mx-auto grid w-full max-w-6xl animate-fade-up gap-6 px-4 pb-28 pt-6 sm:px-6 lg:gap-8 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      <BottomNav items={nav} hideOn={hideBottomNavOn} />
      <Toaster />
    </div>
  );
}

function Brand({ href, portalName, compact = false }: { href: string; portalName: string; compact?: boolean }) {
  return (
    <Link href={href} className="focus-ring flex min-w-0 items-center gap-3 rounded-xl">
      <img src="/logo.jpg" alt="" className={compact ? "h-8 w-8 rounded-lg object-cover ring-1 ring-stone-200" : "h-10 w-10 rounded-xl object-cover ring-1 ring-stone-200"} />
      <span className="min-w-0 leading-tight">
        <span className="block text-sm font-extrabold tracking-tight text-primary">APLUS ACADEMY</span>
        <span className="block text-xs font-medium text-stone-500">{portalName}</span>
      </span>
    </Link>
  );
}
