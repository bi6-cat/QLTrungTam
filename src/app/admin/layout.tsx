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
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link href="/" className="focus-ring flex items-center gap-3 rounded-xl">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-10 w-10 rounded-xl border border-stone-200 bg-white object-cover shadow-sm"
            />
            <div>
              <p className="text-sm font-bold tracking-tight text-primary">APLUS ACADEMY</p>
              <p className="text-xs text-stone-500">
                Xin chào, {session.username}
                {session.role === "manager" ? ` · ${ROLE_LABEL.manager}` : ""}
              </p>
            </div>
          </Link>
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
          <AdminNav role={session.role} />
        </aside>
        <main className="min-w-0 animate-fade-up">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
