import { NextResponse } from "next/server";
import { matchInvoiceFromTransaction } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getAmount(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  if (typeof value === "string") return Math.round(Number(value.replace(/[^\d.-]/g, "")));
  return 0;
}

export async function POST(request: Request) {
  const settings = await getAppSettings();
  const expectedSecret = settings.sepayWebhookSecret || settings.sepayApiKey;
  const receivedSecret =
    request.headers.get("x-sepay-secret") ||
    request.headers.get("x-api-key") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (expectedSecret && receivedSecret !== expectedSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json();
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

  const match = await matchInvoiceFromTransaction({ content: rawContent, amount, transferredAt });

  const transaction = await prisma.transaction.upsert({
    where: { gatewayRef },
    update: {
      amount,
      rawContent,
      transferredAt,
      matchedInvoiceId: match.invoice?.id ?? null,
      rawPayload: payload
    },
    create: {
      gatewayRef,
      amount,
      rawContent,
      transferredAt,
      matchedInvoiceId: match.invoice?.id ?? null,
      rawPayload: payload
    }
  });

  if (match.invoice) {
    await prisma.monthlyInvoice.update({
      where: { id: match.invoice.id },
      data: { status: "paid", paidAt: new Date(), transactionId: transaction.id }
    });
  }

  return NextResponse.json({
    ok: true,
    matched: Boolean(match.invoice),
    reason: match.reason
  });
}
