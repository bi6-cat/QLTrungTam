import type { Prisma } from "@prisma/client";
import { runSerializable as runSerializableTransaction } from "@/lib/serializable";

export type InvoiceLifecycleStatus = "unpaid" | "void" | "waived";

export type InvoiceLifecycleActor = {
  userId: string;
  username: string;
};

export type ChangeInvoiceLifecycleInput = {
  invoiceId: string;
  targetStatus: InvoiceLifecycleStatus;
  actor: InvoiceLifecycleActor;
  /** Không bắt buộc; hủy/miễn mà để trống thì lưu lý do mặc định (DB yêu cầu có lý do). */
  reason?: string;
};

export type ChangeInvoiceLifecycleResult = {
  invoiceId: string;
  previousStatus: InvoiceLifecycleStatus;
  targetStatus: InvoiceLifecycleStatus;
  changedAt: Date;
};

export type InvoiceLifecycleErrorCode =
  | "INVALID_ACTOR"
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

const MAX_REASON_LENGTH = 1_000;

function assertActor(actor: InvoiceLifecycleActor) {
  if (!actor.userId.trim() || !actor.username.trim()) {
    throw new InvoiceLifecycleError(
      "INVALID_ACTOR",
      "Không xác định được người thực hiện thao tác."
    );
  }
}

const DEFAULT_STATUS_REASON: Record<InvoiceLifecycleStatus, string | null> = {
  unpaid: null,
  void: "Hủy hóa đơn",
  waived: "Miễn học phí"
};

function optionalReason(reason: string | undefined) {
  const normalized = reason?.trim();
  return normalized ? normalized.slice(0, MAX_REASON_LENGTH) : null;
}

function runSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return runSerializableTransaction(work, {
    onConflict: () =>
      new InvoiceLifecycleError(
        "CONCURRENT_MODIFICATION",
        "Hóa đơn vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại."
      )
  });
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
  const reason = optionalReason(input.reason);

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
        sessions: true,
        enrollmentId: true,
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
        statusReason: reason ?? DEFAULT_STATUS_REASON[input.targetStatus],
        statusChangedAt: changedAt
      }
    });

    if (changed.count !== 1) {
      throw new InvoiceLifecycleError(
        "CONCURRENT_MODIFICATION",
        "Hóa đơn vừa được thanh toán hoặc thay đổi bởi thao tác khác."
      );
    }

    if (input.targetStatus === "unpaid") {
      // Khôi phục hóa đơn đã hủy do Bảo lưu: kế hoạch tháng quay về "Đang học" theo hóa đơn.
      await tx.enrollmentMonth.updateMany({
        where: {
          enrollmentId: invoice.enrollmentId,
          month: invoice.month,
          year: invoice.year,
          status: "on_leave"
        },
        data: { status: "active", sessions: invoice.sessions }
      });
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
