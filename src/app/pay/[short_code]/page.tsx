import { notFound } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PaymentFlow } from "@/components/PaymentFlow";
import { PublicBrandHeader } from "@/components/PublicBrandHeader";
import { buildVietQrDeepLink, buildVietQrImageUrl } from "@/lib/payment";
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
        where: { status: "active" },
        orderBy: { student: { fullName: "asc" } },
        include: {
          student: true,
          invoices: {
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
  const students = classRoom.enrollments.map((enrollment) => ({
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
      }),
      deepLink: buildVietQrDeepLink(invoice.memoContent, invoice.amount)
    }))
  }));

  return (
    <main className="min-h-screen bg-neutralBg">
      <PublicBrandHeader subtitle="Cổng nộp học phí phụ huynh" />
      <div className="mx-auto grid max-w-md gap-5 px-4 py-5">
        <header className="rounded-lg bg-primary p-5 text-white shadow-soft">
          <p className="text-sm font-semibold opacity-80">Nộp học phí</p>
          <h1 className="mt-1 text-2xl font-bold">{classRoom.name}</h1>
          <p className="mt-2 text-sm opacity-90">Chọn tên học sinh, kiểm tra số tiền và chuyển khoản đúng nội dung.</p>
        </header>

        {students.length === 0 ? (
          <section className="rounded-lg bg-white p-6 text-center shadow-soft">
            <AlertCircle className="mx-auto h-10 w-10 text-warning" />
            <h2 className="mt-3 text-lg font-bold">Lớp chưa có học sinh đang học</h2>
            <p className="mt-2 text-stone-600">Vui lòng liên hệ trung tâm để kiểm tra lại đường dẫn.</p>
          </section>
        ) : (
          <PaymentFlow students={students} />
        )}
      </div>
    </main>
  );
}
