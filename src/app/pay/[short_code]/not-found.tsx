import { AlertCircle } from "lucide-react";

export default function PayNotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-neutralBg px-4">
      <section className="max-w-md rounded-lg bg-white p-6 text-center shadow-soft">
        <AlertCircle className="mx-auto h-12 w-12 text-warning" />
        <h1 className="mt-4 text-xl font-bold">Không tìm thấy lớp học này</h1>
        <p className="mt-2 text-stone-600">Vui lòng liên hệ trung tâm để nhận lại đường dẫn nộp học phí.</p>
      </section>
    </main>
  );
}
