import { ShieldCheck } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      {/* Cột giới thiệu: chỉ hiện trên màn hình rộng. */}
      <aside className="relative hidden flex-col justify-between border-r border-stone-200 bg-stone-50 p-12 lg:flex">
        <div className="absolute inset-x-0 top-0 h-1 bg-primary" />
        <div className="flex items-center gap-3">
          <img src="/logo.jpg" alt="" className="h-10 w-10 rounded-lg border border-stone-200 bg-white object-cover" />
          <span className="text-sm font-bold tracking-[0.2em] text-neutralText">APLUS ACADEMY</span>
        </div>

        <div className="max-w-md">
          <span className="block h-0.5 w-12 bg-primary" />
          <p className="mt-6 text-4xl font-semibold leading-tight tracking-tight text-neutralText">
            Lớp học, học phí và thời khóa biểu — gọn trong một nơi.
          </p>
          <p className="mt-4 text-base leading-relaxed text-stone-500">
            Theo dõi học sinh, điểm danh buổi học và đối soát học phí hằng tháng cho trung tâm.
          </p>
        </div>

        <p className="text-xs text-stone-400">© {new Date().getFullYear()} APLUS ACADEMY</p>
      </aside>

      {/* Cột đăng nhập. */}
      <section className="flex flex-col px-6 py-10 sm:px-12">
        <div className="flex items-center gap-3 lg:hidden">
          <img src="/logo.jpg" alt="" className="h-9 w-9 rounded-lg border border-stone-200 bg-white object-cover" />
          <span className="text-sm font-bold tracking-[0.2em] text-neutralText">APLUS ACADEMY</span>
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Quản trị</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutralText">Đăng nhập</h1>
          <p className="mt-2 text-sm text-stone-500">Nhập tài khoản được cấp để vào hệ thống quản lý.</p>

          <div className="mt-8 border-t border-stone-200 pt-8">
            <LoginForm />
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-xs text-stone-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Kết nối bảo mật · chỉ dành cho quản trị viên
        </p>
      </section>
    </main>
  );
}
