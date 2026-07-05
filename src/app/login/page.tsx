import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutralBg px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-stone-200 bg-white p-6 shadow-soft">
        <div className="mb-6">
          <p className="text-sm font-semibold text-primary">QL Trung Tâm</p>
          <h1 className="mt-2 text-2xl font-bold text-neutralText">Đăng nhập admin</h1>
          <p className="mt-2 text-sm text-stone-600">Vui lòng đăng nhập để tiếp tục.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
