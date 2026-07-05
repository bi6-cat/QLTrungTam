import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { Button } from "@/components/ui";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-10 w-10 rounded-xl border border-stone-200 bg-white object-cover shadow-sm"
            />
            <div>
              <p className="text-sm font-bold tracking-tight text-primary">APLUS ACADEMY</p>
              <p className="text-xs text-stone-500">Xin chào, {session.username}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] gap-6 px-4 py-6 lg:grid-cols-[236px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-2xl border border-stone-200/80 bg-white/80 p-2 shadow-soft backdrop-blur lg:sticky lg:top-[80px]">
          <AdminNav />
        </aside>
        <main className="min-w-0 animate-fade-up">{children}</main>
      </div>
    </div>
  );
}
