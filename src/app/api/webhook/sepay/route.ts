import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { matchInvoiceFromTransaction } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_INT32 = 2_147_483_647;
const MIN_INT32 = -2_147_483_648;
const AUTO_MATCH_REASON = "automatic_memo_match";
const INVOICE_ALREADY_CLAIMED_REASON = "Hóa đơn đã được giao dịch khác thanh toán.";
const INVOICE_AMOUNT_CHANGED_REASON = "Số tiền hóa đơn đã thay đổi trước khi giao dịch được ghi nhận.";

function getString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function getIdentifier(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toInt32(value: number) {
  if (!Number.isFinite(value)) return null;

  const rounded = Math.round(value);
  if (rounded < MIN_INT32 || rounded > MAX_INT32) return null;
  return rounded;
}

function getAmount(value: unknown) {
  if (typeof value === "number") return toInt32(value);
  if (typeof value === "string") {
    // VND không có phần thập phân -> bỏ mọi dấu phân cách nghìn (chấm/phẩy/space).
    const digits = value.replace(/[^\d-]/g, "");
    if (!digits || digits === "-") return null;
    return toInt32(Number(digits));
  }
  return null;
}

function normalizeAccountNumber(value: string) {
  return value.replace(/\D/g, "");
}

function getAuthorizationSecret(value: string | null) {
  return value?.replace(/^(Bearer|Apikey|ApiKey)\s+/i, "").trim() || "";
}

function isKnownPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

function isGatewayRefUniqueViolation(error: unknown) {
  if (!isKnownPrismaError(error, "P2002")) return false;

  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? "")];

  return fields.some(
    (field) => field === "gatewayRef" || field.includes("Transaction_gatewayRef_key")
  );
}

export async function POST(request: Request) {
  const settings = await getAppSettings();
  const expectedSecret = settings.sepayWebhookSecret || settings.sepayApiKey;

  // Fail-closed: nếu chưa cấu hình secret thì từ chối, tránh webhook bị mở công khai.
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

  const transferType = (
    getString(payload.transferType) || getString(payload.transfer_type)
  )
    .trim()
    .toLowerCase();
  const accountNumber =
    getIdentifier(payload.accountNumber) || getIdentifier(payload.account_number);

  // Hai trường này xác định webhook có thuộc luồng tiền vào của trung tâm hay không.
  // Thiếu trường là payload sai; có đủ nhưng ngoài phạm vi thì ACK để SePay không gửi lại.
  if (!transferType || !normalizeAccountNumber(accountNumber)) {
    return NextResponse.json(
      { error: "Missing transferType or accountNumber" },
      { status: 400 }
    );
  }

  if (transferType !== "in") {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: "unsupported_transfer_type"
    });
  }

  const expectedAccountNumber = normalizeAccountNumber(settings.bankAccountNumber);
  if (!expectedAccountNumber) {
    return NextResponse.json({ error: "Bank account not configured" }, { status: 503 });
  }

  if (normalizeAccountNumber(accountNumber) !== expectedAccountNumber) {
    return NextResponse.json({
      success: true,
      ignored: true,
      reason: "account_mismatch"
    });
  }

  const gatewayRef =
    getIdentifier(payload.id) ||
    getIdentifier(payload.gateway_ref) ||
    getIdentifier(payload.referenceCode) ||
    getIdentifier(payload.transaction_id);
  const rawContent =
    getString(payload.content) ||
    getString(payload.transfer_content) ||
    getString(payload.description);
  const amount = getAmount(
    payload.transferAmount ?? payload.transfer_amount ?? payload.amount
  );
  const transferredAtValue = payload.transactionDate ?? payload.transferred_at;
  const transferredAt = transferredAtValue
    ? new Date(String(transferredAtValue))
    : null;

  if (
    !gatewayRef ||
    amount === null ||
    amount <= 0 ||
    !transferredAt ||
    Number.isNaN(transferredAt.getTime())
  ) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Idempotency: bản gửi lại chỉ đọc trạng thái cũ, tuyệt đối không thử khớp lại.
  const existing = await prisma.transaction.findUnique({
    where: { gatewayRef },
    select: { matchedInvoiceId: true, resolvedAt: true, reversedAt: true, matchReason: true }
  });
  if (existing) {
    return NextResponse.json({
      success: true,
      matched: Boolean(
        existing.matchedInvoiceId && !existing.resolvedAt && !existing.reversedAt
      ),
      reason: existing.matchReason,
      duplicate: true
    });
  }

  const match = await matchInvoiceFromTransaction({ content: rawContent, amount, transferredAt });

  try {
    let result: { matched: boolean; reason: string | null } | null = null;

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        result = await prisma.$transaction(
          async (tx) => {
            // Tạo giao dịch chưa gán trước; chỉ liên kết sau khi claim hóa đơn thành công.
            const transaction = await tx.transaction.create({
              data: {
                gatewayRef,
                amount,
                rawContent,
                transferredAt,
                paymentMethod: "bank_transfer",
                matchedInvoiceId: null,
                matchedAt: null,
                matchReason: match.invoice ? null : match.reason,
                matchOverrideReason: null,
                reversedAt: null,
                reversalReason: null,
                resolvedAt: null,
                resolvedNote: null,
                rawPayload: payload as Prisma.InputJsonValue
              },
              select: { id: true }
            });

            if (!match.invoice) {
              return { matched: false, reason: match.reason };
            }

            const claimedInvoice = await tx.monthlyInvoice.updateMany({
              where: {
                id: match.invoice.id,
                status: "unpaid",
                transactionId: null,
                amount
              },
              data: {
                status: "paid",
                paidAt: transferredAt,
                transactionId: transaction.id
              }
            });

            if (claimedInvoice.count !== 1) {
              const currentInvoice = await tx.monthlyInvoice.findUnique({
                where: { id: match.invoice.id },
                select: { amount: true }
              });
              const unmatchedReason =
                currentInvoice && currentInvoice.amount !== amount
                  ? INVOICE_AMOUNT_CHANGED_REASON
                  : INVOICE_ALREADY_CLAIMED_REASON;

              await tx.transaction.updateMany({
                where: {
                  id: transaction.id,
                  matchedInvoiceId: null,
                  resolvedAt: null,
                  reversedAt: null
                },
                data: { matchReason: unmatchedReason }
              });

              return { matched: false, reason: unmatchedReason };
            }

            const linkedTransaction = await tx.transaction.updateMany({
              where: {
                id: transaction.id,
                matchedInvoiceId: null,
                resolvedAt: null,
                reversedAt: null
              },
              data: {
                matchedInvoiceId: match.invoice.id,
                matchedAt: new Date(),
                matchReason: AUTO_MATCH_REASON
              }
            });

            if (linkedTransaction.count !== 1) {
              throw new Error("Không thể hoàn tất liên kết giao dịch SePay với hóa đơn.");
            }

            await tx.auditLog.create({
              data: {
                actorUserId: null,
                actorUsername: "system:sepay",
                action: "transaction.auto_assigned",
                entityType: "Transaction",
                entityId: transaction.id,
                metadata: {
                  invoiceId: match.invoice.id,
                  amount,
                  paymentMethod: "bank_transfer",
                  transferredAt: transferredAt.toISOString(),
                  source: "sepay_webhook"
                }
              }
            });

            return { matched: true, reason: null };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        );
        break;
      } catch (error) {
        if (isKnownPrismaError(error, "P2034") && attempt < MAX_SERIALIZABLE_ATTEMPTS) {
          continue;
        }
        throw error;
      }
    }

    if (!result) {
      throw new Error("Không thể lưu giao dịch SePay do xung đột dữ liệu.");
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // Chỉ unique gatewayRef mới là webhook gửi lặp. P2002 ở liên kết hóa đơn phải nổi lên
    // để phát hiện dữ liệu sổ không nhất quán, không được báo nhầm là duplicate.
    if (isGatewayRefUniqueViolation(error)) {
      const duplicate = await prisma.transaction.findUnique({
        where: { gatewayRef },
        select: { matchedInvoiceId: true, resolvedAt: true, reversedAt: true, matchReason: true }
      });

      if (duplicate) {
        return NextResponse.json({
          success: true,
          matched: Boolean(
            duplicate.matchedInvoiceId && !duplicate.resolvedAt && !duplicate.reversedAt
          ),
          reason: duplicate.matchReason,
          duplicate: true
        });
      }
    }

    throw error;
  }
}
