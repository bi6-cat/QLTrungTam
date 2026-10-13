import Link from "next/link";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/roles";
import { Button } from "@/components/ui";
import { AdminNav } from "@/components/AdminNav";
import { Toaster } from "@/components/Toaster";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl">
        {/* Dải màu chủ đạo mảnh trên cùng. */}
        <div className="h-1 bg-primary" />
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3 px-4 py-2.5 lg:px-8 lg:py-3">
          <Link href="/" className="focus-ring flex items-center gap-3 rounded-xl">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-9 w-9 rounded-xl border border-stone-200 bg-white object-cover shadow-sm lg:h-10 lg:w-10"
            />
            <div className="min-w-0">
              <p className="text-sm font-extrabold tracking-tight text-primary">APLUS ACADEMY</p>
              <p className="truncate text-xs text-stone-500">
                Xin chào, {session.username}
                {session.role === "manager" ? ` · ${ROLE_LABEL.manager}` : ""}
              </p>
            </div>
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary" className="h-10 px-3 lg:h-11 lg:px-4">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </form>
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
