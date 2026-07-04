import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const { invoiceId } = await params;
  const paidAt = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.monthlyInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        enrollment: {
          include: {
            student: true,
            classRoom: true
          }
        }
      }
    });

    if (!invoice) {
      return { ok: false as const, status: 404, error: "Không tìm thấy hóa đơn." };
    }

    if (invoice.status === "paid") {
      return { ok: true as const, alreadyPaid: true };
    }

    const claimed = await tx.monthlyInvoice.updateMany({
      where: { id: invoice.id, status: "unpaid" },
      data: {
        status: "paid",
        paidAt
      }
    });

    if (claimed.count === 0) {
      return { ok: true as const, alreadyPaid: true };
    }

    const transaction = await tx.transaction.create({
      data: {
        gatewayRef: `CASH-${invoice.id}-${paidAt.getTime()}`,
        amount: invoice.amount,
        rawContent: `Thu tiền mặt: ${invoice.enrollment.student.fullName} - ${invoice.enrollment.classRoom.shortCode} - T${invoice.month}/${invoice.year}`,
        transferredAt: paidAt,
        matchedInvoiceId: invoice.id,
        rawPayload: {
          method: "cash",
          source: "admin_manual",
          invoiceId: invoice.id,
          admin: session.username
        }
      }
    });

    await tx.monthlyInvoice.update({
      where: { id: invoice.id },
      data: {
        transactionId: transaction.id
      }
    });

    return { ok: true as const, alreadyPaid: false };
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin/transactions");
  revalidatePath("/pay/[short_code]", "page");
  revalidatePath("/teacher/classes/[short_code]", "page");

  return NextResponse.json(result);
}
