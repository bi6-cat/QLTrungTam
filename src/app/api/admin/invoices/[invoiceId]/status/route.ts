import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  changeInvoiceLifecycle,
  InvoiceLifecycleError,
  type InvoiceLifecycleStatus
} from "@/lib/invoice-lifecycle";

const ALLOWED_STATUSES = new Set<InvoiceLifecycleStatus>(["unpaid", "void", "waived"]);

function errorStatus(error: InvoiceLifecycleError) {
  if (error.code === "INVOICE_NOT_FOUND") return 404;
  if (
    error.code === "INVOICE_PAID" ||
    error.code === "INVOICE_HAS_PAYMENT_DATA" ||
    error.code === "CONCURRENT_MODIFICATION"
  ) {
    return 409;
  }
  return 400;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const targetStatus = String(body.targetStatus ?? "") as InvoiceLifecycleStatus;
  const reason = String(body.reason ?? "").trim();
  if (!ALLOWED_STATUSES.has(targetStatus) || !reason || reason.length > 500) {
    return NextResponse.json(
      { error: "Chọn trạng thái và nhập lý do từ 1 đến 500 ký tự." },
      { status: 400 }
    );
  }

  const { invoiceId } = await params;
  try {
    const result = await changeInvoiceLifecycle({
      invoiceId,
      targetStatus,
      reason,
      actor: session
    });

    revalidatePath("/admin");
    revalidatePath("/admin/classes");
    revalidatePath("/admin/transactions");
    revalidatePath("/pay/[short_code]", "page");
    revalidatePath("/teacher/classes/[short_code]", "page");

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof InvoiceLifecycleError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: errorStatus(error) }
      );
    }
    throw error;
  }
}
