import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PaymentFlow } from "@/components/PaymentFlow";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { resolveClassLink } from "@/lib/class-link-resolver";
import { getPayableStudents } from "@/lib/pay-portal";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false }
};

export default async function PayPage({
  params,
  searchParams
}: {
  params: Promise<{ short_code: string }>;
  searchParams: Promise<{ hs?: string }>;
}) {
  const { short_code } = await params;
  const { hs } = await searchParams;
  const resolved = await resolveClassLink(short_code, "pay");
  if (!resolved) notFound();
  if (resolved.kind === "redirect") redirect(resolved.redirectTo);

  const classRoom = await getPayableStudents(resolved.classId);
  if (!classRoom) notFound();
  const { students } = classRoom;

  return (
    <main className="min-h-screen">
      <PublicBrandHeader subtitle="Cổng nộp học phí phụ huynh" />
      <div className="mx-auto grid max-w-md animate-fade-up gap-5 px-4 py-5">
        <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-primary p-6 text-white shadow-card">
          <div className="bg-grid absolute inset-0 opacity-40" />
          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20">
              Nộp học phí
            </span>
            <h1 className="mt-3 text-2xl font-bold tracking-tight">{classRoom.name}</h1>
            <p className="mt-2 text-sm text-white/85">Tìm tên học sinh, kiểm tra số tiền rồi quét mã QR để chuyển khoản.</p>
          </div>
        </header>

        {students.length === 0 ? (
          <section className="rounded-2xl border border-stone-200/80 bg-white p-8 text-center shadow-soft">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-warning">
              <AlertCircle className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-lg font-bold">Không có khoản cần thanh toán</h2>
            <p className="mt-2 text-stone-600">Lớp chưa có học sinh đang học hoặc mọi khoản đã được xử lý.</p>
          </section>
        ) : (
          <PaymentFlow
            classSlug={short_code}
            students={students}
            // Link nhắc nợ có ?hs=<mã học sinh>: mở thẳng học phí của em đó nếu em có trong lớp.
            initialStudentId={students.some((student) => student.id === hs) ? hs : undefined}
          />
        )}
      </div>
    </main>
  );
}
