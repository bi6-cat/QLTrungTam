import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PaymentFlow } from "@/components/PaymentFlow";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { buildVietQrImageUrl } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params
}: {
  params: Promise<{ short_code: string }>;
}) {
  const { short_code } = await params;
  const classRoom = await prisma.classRoom.findUnique({
    where: { publicToken: short_code },
    include: {
      enrollments: {
        where: {
          OR: [
            { status: "active", student: { archivedAt: null } },
            { invoices: { some: { status: "unpaid" } } }
          ]
        },
        orderBy: { student: { fullName: "asc" } },
        include: {
          student: true,
          invoices: {
            where: { status: { in: ["unpaid", "paid", "waived", "void"] } },
            orderBy: [{ year: "desc" }, { month: "desc" }]
          }
        }
      }
    }
  });

  if (!classRoom) {
    notFound();
  }

  const settings = await getAppSettings();
  const bankBin = settings.bankBin;
  const accountNumber = settings.bankAccountNumber;
  const accountName = settings.bankAccountName;
  const payableEnrollments = classRoom.enrollments.filter(
    (enrollment) =>
      enrollment.invoices.some((invoice) => invoice.status === "unpaid") ||
      (!classRoom.archivedAt && !enrollment.student.archivedAt)
  );
  const students = payableEnrollments.map((enrollment) => ({
    id: enrollment.student.id,
    fullName: enrollment.student.fullName,
    invoices: enrollment.invoices.map((invoice) => ({
      id: invoice.id,
      month: invoice.month,
      year: invoice.year,
      amount: invoice.amount,
      memoContent: invoice.memoContent,
      status: invoice.status,
      qrImageUrl: buildVietQrImageUrl({
        bankBin,
        accountNumber,
        accountName,
        amount: invoice.amount,
        memo: invoice.memoContent
      })
    }))
  }));

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
            <p className="mt-2 text-sm text-white/85">Chọn tên học sinh, kiểm tra số tiền rồi quét mã QR để chuyển khoản.</p>
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
          <PaymentFlow students={students} />
        )}
      </div>
    </main>
  );
}
