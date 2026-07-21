import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { LedgerError, recordCashPayment } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";

function ledgerErrorStatus(error: LedgerError) {
  switch (error.code) {
    case "INVALID_ACTOR":
      return 401;
    case "INVOICE_NOT_FOUND":
      return 404;
    case "INVOICE_ALREADY_PAID":
    case "CONCURRENT_MODIFICATION":
    case "INCONSISTENT_LEDGER":
      return 409;
    case "REASON_REQUIRED":
    case "FORCE_REASON_REQUIRED":
    case "AMOUNT_MISMATCH":
      return 400;
    default:
      return 422;
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const { invoiceId } = await params;

  try {
    const result = await recordCashPayment({
      invoiceId,
      actor: {
        userId: session.userId,
        username: session.username
      }
    });

    revalidatePath("/admin/classes");
    revalidatePath("/admin/transactions");
    revalidatePath("/pay/[short_code]", "page");
    revalidatePath("/teacher/classes/[short_code]", "page");

    return NextResponse.json({
      ok: true,
      alreadyPaid: false,
      transactionId: result.transactionId
    });
  } catch (error) {
    if (error instanceof LedgerError) {
      if (error.code === "INVOICE_ALREADY_PAID") {
        const existing = await prisma.monthlyInvoice.findUnique({
          where: { id: invoiceId },
          select: {
            status: true,
            transaction: {
              select: {
                id: true,
                paymentMethod: true,
                matchedInvoiceId: true,
                reversedAt: true
              }
            }
          }
        });

        if (
          existing?.status === "paid" &&
          existing.transaction?.paymentMethod === "cash" &&
          existing.transaction.matchedInvoiceId === invoiceId &&
          !existing.transaction.reversedAt
        ) {
          return NextResponse.json({
            ok: true,
            alreadyPaid: true,
            transactionId: existing.transaction.id
          });
        }
      }

      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: ledgerErrorStatus(error) }
      );
    }

    throw error;
  }
}
