import { AlertCircle } from "lucide-react";

export default function PayNotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <section className="max-w-md animate-scale-in rounded-2xl border border-stone-200/80 bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-warning">
          <AlertCircle className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold tracking-tight">Không tìm thấy lớp học này</h1>
        <p className="mt-2 text-stone-600">Vui lòng liên hệ trung tâm để nhận lại đường dẫn nộp học phí.</p>
      </section>
    </main>
  );
}
