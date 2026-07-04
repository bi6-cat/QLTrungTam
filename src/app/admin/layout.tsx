import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions";
import { requireAdmin } from "@/lib/auth";
import { Button } from "@/components/ui";
import { AdminNav } from "@/components/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();

  return (
    <div className="min-h-screen bg-neutralBg">
      <header className="border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-10 w-10 rounded-md border border-stone-200 bg-white object-cover"
            />
            <div>
              <p className="text-sm font-bold text-primary">APLUS ACADEMY</p>
              <p className="text-xs text-stone-500">Xin chào, {session.username}</p>
            </div>
          </div>
          <form action={logoutAction}>
            <Button type="submit" variant="secondary">
              <LogOut className="h-4 w-4" />
              Đăng xuất
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1800px] gap-6 px-4 py-6 lg:grid-cols-[230px_minmax(0,1fr)] lg:px-8">
        <aside className="h-fit rounded-lg border border-stone-200 bg-white p-2 shadow-soft">
          <AdminNav />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
