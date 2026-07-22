import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type InvoiceLifecycleStatus = "unpaid" | "void" | "waived";

export type InvoiceLifecycleActor = {
  userId: string;
  username: string;
};

export type ChangeInvoiceLifecycleInput = {
  invoiceId: string;
  targetStatus: InvoiceLifecycleStatus;
  actor: InvoiceLifecycleActor;
  reason: string;
};

export type ChangeInvoiceLifecycleResult = {
  invoiceId: string;
  previousStatus: InvoiceLifecycleStatus;
  targetStatus: InvoiceLifecycleStatus;
  changedAt: Date;
};

export type InvoiceLifecycleErrorCode =
  | "INVALID_ACTOR"
  | "REASON_REQUIRED"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_PAID"
  | "NO_OP"
  | "INVALID_TRANSITION"
  | "INVOICE_HAS_PAYMENT_DATA"
  | "CONCURRENT_MODIFICATION";

export class InvoiceLifecycleError extends Error {
  readonly code: InvoiceLifecycleErrorCode;

  constructor(code: InvoiceLifecycleErrorCode, message: string) {
    super(message);
    this.name = "InvoiceLifecycleError";
    this.code = code;
  }
}

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const MAX_REASON_LENGTH = 1_000;

function assertActor(actor: InvoiceLifecycleActor) {
  if (!actor.userId.trim() || !actor.username.trim()) {
    throw new InvoiceLifecycleError(
      "INVALID_ACTOR",
      "Không xác định được người thực hiện thao tác."
    );
  }
}

function requireReason(reason: string) {
  const normalized = reason.trim();
  if (!normalized) {
    throw new InvoiceLifecycleError(
      "REASON_REQUIRED",
      "Cần nhập lý do thay đổi trạng thái hóa đơn."
    );
  }
  return normalized.slice(0, MAX_REASON_LENGTH);
}

function isKnownPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

async function runSerializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (error instanceof InvoiceLifecycleError) throw error;

      if (isKnownPrismaError(error, "P2034")) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        throw new InvoiceLifecycleError(
          "CONCURRENT_MODIFICATION",
          "Hóa đơn vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại."
        );
      }

      throw error;
    }
  }

  throw new InvoiceLifecycleError(
    "CONCURRENT_MODIFICATION",
    "Không thể hoàn tất thay đổi do xung đột dữ liệu."
  );
}

function assertTransition(input: {
  currentStatus: string;
  targetStatus: InvoiceLifecycleStatus;
  transactionId: string | null;
  matchedTransactionId: string | null;
  paidAt: Date | null;
}) {
  if (input.currentStatus === "paid") {
    throw new InvoiceLifecycleError(
      "INVOICE_PAID",
      "Hóa đơn đã thanh toán. Cần hoàn tác giao dịch trước khi đổi trạng thái hóa đơn."
    );
  }

  if (input.transactionId || input.matchedTransactionId || input.paidAt) {
    throw new InvoiceLifecycleError(
      "INVOICE_HAS_PAYMENT_DATA",
      "Hóa đơn còn dữ liệu thanh toán. Cần hoàn tác hoặc đối soát trước khi đổi trạng thái."
    );
  }

  if (input.currentStatus === input.targetStatus) {
    throw new InvoiceLifecycleError(
      "NO_OP",
      "Hóa đơn đã ở trạng thái được chọn."
    );
  }

  const canVoidOrWaive =
    input.currentStatus === "unpaid" &&
    (input.targetStatus === "void" || input.targetStatus === "waived");
  const canRestore =
    (input.currentStatus === "void" || input.currentStatus === "waived") &&
    input.targetStatus === "unpaid";

  if (!canVoidOrWaive && !canRestore) {
    throw new InvoiceLifecycleError(
      "INVALID_TRANSITION",
      "Chuyển đổi trạng thái hóa đơn không hợp lệ. Hóa đơn miễn hoặc hủy chỉ có thể phục hồi về chưa thanh toán."
    );
  }
}

/**
 * Changes the lifecycle of an invoice without deleting it or its history.
 *
 * Payment state and lifecycle state are claimed with one compare-and-set inside
 * a serializable transaction, so a concurrent payment cannot race a void/waive.
 */
export async function changeInvoiceLifecycle(
  input: ChangeInvoiceLifecycleInput
): Promise<ChangeInvoiceLifecycleResult> {
  assertActor(input.actor);
  const reason = requireReason(input.reason);

  return runSerializable(async (tx) => {
    const invoice = await tx.monthlyInvoice.findUnique({
      where: { id: input.invoiceId },
      select: {
        id: true,
        status: true,
        transactionId: true,
        paidAt: true,
        amount: true,
        month: true,
        year: true,
        matchedTransaction: { select: { id: true } }
      }
    });

    if (!invoice) {
      throw new InvoiceLifecycleError(
        "INVOICE_NOT_FOUND",
        "Không tìm thấy hóa đơn."
      );
    }

    assertTransition({
      currentStatus: invoice.status,
      targetStatus: input.targetStatus,
      transactionId: invoice.transactionId,
      matchedTransactionId: invoice.matchedTransaction?.id ?? null,
      paidAt: invoice.paidAt
    });

    const previousStatus = invoice.status as InvoiceLifecycleStatus;
    const changedAt = new Date();
    const changed = await tx.monthlyInvoice.updateMany({
      where: {
        id: invoice.id,
        status: previousStatus,
        transactionId: null,
        paidAt: null,
        matchedTransaction: { is: null },
        amount: invoice.amount,
        month: invoice.month,
        year: invoice.year
      },
      data: {
        status: input.targetStatus,
        statusReason: reason,
        statusChangedAt: changedAt
      }
    });

    if (changed.count !== 1) {
      throw new InvoiceLifecycleError(
        "CONCURRENT_MODIFICATION",
        "Hóa đơn vừa được thanh toán hoặc thay đổi bởi thao tác khác."
      );
    }

    const action =
      input.targetStatus === "unpaid"
        ? "invoice.restored"
        : input.targetStatus === "void"
          ? "invoice.voided"
          : "invoice.waived";

    await tx.auditLog.create({
      data: {
        actorUserId: input.actor.userId,
        actorUsername: input.actor.username.trim(),
        action,
        entityType: "MonthlyInvoice",
        entityId: invoice.id,
        reason,
        metadata: {
          previousStatus,
          targetStatus: input.targetStatus,
          amount: invoice.amount,
          month: invoice.month,
          year: invoice.year
        }
      }
    });

    return {
      invoiceId: invoice.id,
      previousStatus,
      targetStatus: input.targetStatus,
      changedAt
    };
  });
}
