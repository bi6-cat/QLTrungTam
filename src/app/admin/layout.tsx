import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { requireStaff } from "@/lib/auth";
import { isStaging } from "@/lib/environment";
import { ROLE_LABEL } from "@/lib/roles";
import { Button } from "@/components/ui";
import { AdminNav } from "@/components/AdminNav";
import { Toaster } from "@/components/Toaster";
import { ThemePicker } from "@/components/ThemePicker";
import { cookies } from "next/headers";
import { THEME_COOKIE, isThemeId } from "@/lib/themes";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();
  const staging = await isStaging();
  const savedTheme = (await cookies()).get(THEME_COOKIE)?.value;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl">
        {/* Dải màu chủ đạo mảnh trên cùng; bản staging luôn là dải cam dày hơn dù đã đổi bộ màu. */}
        <div className={staging ? "h-1.5 bg-orange-500" : "h-1 bg-primary"} />
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-4 py-2.5 lg:px-8 lg:py-3">
          <Link href="/" className="focus-ring flex items-center gap-3 rounded-xl">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 rounded-xl border border-stone-200 bg-white object-cover shadow-sm lg:h-10 lg:w-10"
            />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-extrabold tracking-tight text-primary">
                APLUS ACADEMY
                {staging ? (
                  <span className="rounded-md bg-orange-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Bản thử · STG
                  </span>
                ) : null}
              </p>
              <p className="truncate text-xs text-stone-500">
                Xin chào, {session.username}
                {session.role === "manager" ? ` · ${ROLE_LABEL.manager}` : ""}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <ThemePicker initial={isThemeId(savedTheme) ? savedTheme : null} />
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" className="h-10 px-3 lg:px-4">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] grid-cols-[minmax(0,1fr)] gap-4 px-4 py-4 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-6 lg:px-8 lg:py-6">
        {/* Điện thoại: thanh tab ngang dính dưới header; máy tính: cột menu bên trái. */}
        <aside className="sticky top-[61px] z-30 -mx-4 h-fit min-w-0 border-b border-stone-200/70 bg-white/90 px-3 py-1.5 backdrop-blur-xl lg:top-[84px] lg:mx-0 lg:rounded-2xl lg:border lg:border-stone-200/80 lg:bg-white/80 lg:p-2 lg:shadow-soft">
          <AdminNav role={session.role} />
        </aside>
        <main className="min-w-0 animate-fade-up">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
