import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-10">
      {/* Vầng sáng nền trang trí */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />

      <section className="relative w-full max-w-md animate-scale-in overflow-hidden rounded-3xl border border-stone-200/80 bg-white/90 shadow-lift backdrop-blur">
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-primary p-7 text-white">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative flex items-center gap-3">
            <img
              src="/logo.jpg"
              alt="APLUS ACADEMY"
              className="h-12 w-12 rounded-xl border border-white/30 bg-white object-cover shadow-sm"
            />
            <div>
              <p className="text-sm font-bold tracking-tight">APLUS ACADEMY</p>
              <p className="text-xs text-white/70">Hệ thống quản lý trung tâm</p>
            </div>
          </div>
          <h1 className="relative mt-6 text-2xl font-bold tracking-tight">Đăng nhập quản trị</h1>
          <p className="relative mt-1 text-sm text-white/80">Vui lòng đăng nhập để tiếp tục.</p>
        </div>

        <div className="p-7">
          <LoginForm />
          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-stone-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            Kết nối bảo mật · chỉ dành cho quản trị viên
          </p>
        </div>
      </section>
    </main>
  );
}
