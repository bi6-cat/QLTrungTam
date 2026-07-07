import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { matchInvoiceFromTransaction } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getAmount(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") {
    // VND không có phần thập phân -> bỏ mọi dấu phân cách nghìn (chấm/phẩy/space).
    const digits = value.replace(/[^\d-]/g, "");
    if (!digits || digits === "-") return 0;
    return Math.round(Number(digits));
  }
  return 0;
}

function getAuthorizationSecret(value: string | null) {
  return value?.replace(/^(Bearer|Apikey|ApiKey)\s+/i, "").trim() || "";
}

export async function POST(request: Request) {
  const settings = await getAppSettings();
  const expectedSecret = settings.sepayWebhookSecret || settings.sepayApiKey;

  // Fail-closed: nếu chưa cấu hình secret thì từ chối, tránh webhook mở toang.
  if (!expectedSecret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 401 });
  }

  const receivedSecret =
    request.headers.get("x-sepay-secret")?.trim() ||
    request.headers.get("x-api-key")?.trim() ||
    getAuthorizationSecret(request.headers.get("authorization"));

  if (receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gatewayRef =
    getString(payload.id) ||
    getString(payload.gateway_ref) ||
    getString(payload.referenceCode) ||
    getString(payload.transaction_id);
  const rawContent =
    getString(payload.content) ||
    getString(payload.transfer_content) ||
    getString(payload.description);
  const amount =
    getAmount(payload.amount) ||
    getAmount(payload.transferAmount) ||
    getAmount(payload.transfer_amount);
  const transferredAt = payload.transactionDate
    ? new Date(String(payload.transactionDate))
    : payload.transferred_at
      ? new Date(String(payload.transferred_at))
      : new Date();

  if (!gatewayRef || !rawContent || amount <= 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Idempotency: giao dịch đã xử lý trước đó thì trả về nguyên trạng, KHÔNG khớp lại
  // (tránh gỡ liên kết hoá đơn đã thanh toán khi SePay gửi lặp cùng gatewayRef).
  const existing = await prisma.transaction.findUnique({ where: { gatewayRef } });
  if (existing) {
    return NextResponse.json({
      ok: true,
      matched: Boolean(existing.matchedInvoiceId),
      duplicate: true
    });
  }

  const match = await matchInvoiceFromTransaction({ content: rawContent, amount, transferredAt });

  try {
    const matched = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          gatewayRef,
          amount,
          rawContent,
          transferredAt,
          matchedInvoiceId: match.invoice?.id ?? null,
          rawPayload: payload as Prisma.InputJsonValue
        }
      });

      if (!match.invoice) return false;

      // Chỉ đóng nếu hoá đơn vẫn đang chưa đóng (tránh double-pay khi chạy song song).
      const claimed = await tx.monthlyInvoice.updateMany({
        where: { id: match.invoice.id, status: "unpaid" },
        data: { status: "paid", paidAt: new Date(), transactionId: transaction.id }
      });

      if (claimed.count === 0) {
        // Đã bị process khác đóng -> gỡ liên kết để không hiểu nhầm là đã khớp.
        await tx.transaction.update({
          where: { id: transaction.id },
          data: { matchedInvoiceId: null }
        });
        return false;
      }

      return true;
    });

    return NextResponse.json({ ok: true, matched, reason: matched ? null : match.reason });
  } catch (error) {
    // Đua tạo trùng gatewayRef (unique constraint) -> coi như bản lặp.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ ok: true, matched: false, duplicate: true });
    }
    throw error;
  }
}
