import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Trạng thái hoá đơn cho trang phụ huynh.
 *
 * Khi đã thanh toán thì trả kèm thông tin dựng biên lai (tên học sinh, lớp,
 * số tiền đã nhận, thời điểm nhận, hình thức) để phụ huynh có bằng chứng ngay
 * trên màn hình mà không phải hỏi lại trung tâm.
 */
export async function GET(_request: Request, context: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await context.params;
  const invoice = await prisma.monthlyInvoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      paidAt: true,
      amount: true,
      month: true,
      year: true,
      memoContent: true,
      studentNameSnapshot: true,
      classNameSnapshot: true,
      classShortCodeSnapshot: true,
      teacherNameSnapshot: true,
      enrollment: {
        select: {
          student: { select: { fullName: true } },
          classRoom: { select: { name: true, shortCode: true, teacherName: true } }
        }
      },
      transaction: { select: { paymentMethod: true, gatewayRef: true, transferredAt: true } }
    }
  });

  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const response = NextResponse.json({
    id: invoice.id,
    status: invoice.status,
    paidAt: invoice.paidAt,
    amount: invoice.amount,
    month: invoice.month,
    year: invoice.year,
    memoContent: invoice.memoContent,
    studentName: invoice.studentNameSnapshot ?? invoice.enrollment.student.fullName,
    className: invoice.classNameSnapshot ?? invoice.enrollment.classRoom.name,
    classShortCode: invoice.classShortCodeSnapshot ?? invoice.enrollment.classRoom.shortCode,
    teacherName: invoice.teacherNameSnapshot ?? invoice.enrollment.classRoom.teacherName ?? "",
    paymentMethod: invoice.transaction?.paymentMethod ?? null,
    receiptRef: invoice.transaction?.gatewayRef ?? null,
    transferredAt: invoice.transaction?.transferredAt ?? null
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
