import type { Prisma } from "@prisma/client";
import { runSerializable as runSerializableTransaction } from "@/lib/serializable";

export type LedgerErrorCode =
  | "INVALID_ACTOR"
  | "TRANSACTION_NOT_FOUND"
  | "INVOICE_NOT_FOUND"
  | "TRANSACTION_ALREADY_MATCHED"
  | "TRANSACTION_NOT_MATCHED"
  | "TRANSACTION_ALREADY_RESOLVED"
  | "TRANSACTION_REVERSED"
  | "INVOICE_ALREADY_PAID"
  | "INVOICE_NOT_PAYABLE"
  | "AMOUNT_MISMATCH"
  | "INCONSISTENT_LEDGER"
  | "CONCURRENT_MODIFICATION";

export class LedgerError extends Error {
  readonly code: LedgerErrorCode;

  constructor(code: LedgerErrorCode, message: string) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}

export type LedgerActor = {
  userId: string;
  username: string;
};

export type AssignTransactionInput = {
  transactionId: string;
  invoiceId: string;
  actor: LedgerActor;
  /**
   * Strict amount matching is the default. Setting force to true always stores an
   * override reason (a default one when left blank) so the mismatch stays visible.
   */
  force?: boolean;
  reason?: string;
};

export type TransactionReasonInput = {
  transactionId: string;
  actor: LedgerActor;
  reason?: string;
};

export type LedgerMutationResult = {
  transactionId: string;
  invoiceId: string | null;
  occurredAt: Date;
};

export type AssignTransactionResult = LedgerMutationResult & {
  forced: boolean;
  amountDifference: number;
};

const MAX_REASON_LENGTH = 1_000;

function assertActor(actor: LedgerActor) {
  if (!actor.userId.trim() || !actor.username.trim()) {
    throw new LedgerError("INVALID_ACTOR", "Không xác định được người thực hiện thao tác.");
  }
}

function optionalReason(reason: string | undefined) {
  const normalized = reason?.trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_REASON_LENGTH);
}

const NO_OVERRIDE_REASON = "Không ghi lý do";

function runSerializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  // Unique link giữa hóa đơn và giao dịch là lớp chặn cuối nếu hai request cùng đua.
  return runSerializableTransaction(work, {
    onConflict: () =>
      new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại."
      ),
    onUniqueViolation: () =>
      new LedgerError("CONCURRENT_MODIFICATION", "Giao dịch hoặc hóa đơn đã được xử lý bởi thao tác khác.")
  });
}

function assertTransactionAvailable(transaction: {
  matchedInvoiceId: string | null;
  resolvedAt: Date | null;
  reversedAt: Date | null;
}) {
  if (transaction.reversedAt) {
    throw new LedgerError("TRANSACTION_REVERSED", "Giao dịch này đã được hoàn tác.");
  }
  if (transaction.resolvedAt) {
    throw new LedgerError("TRANSACTION_ALREADY_RESOLVED", "Giao dịch này đã được đánh dấu xử lý.");
  }
  if (transaction.matchedInvoiceId) {
    throw new LedgerError("TRANSACTION_ALREADY_MATCHED", "Giao dịch này đã được gán cho hóa đơn khác.");
  }
}

function assertInvoiceAvailable(invoice: { status: string; transactionId: string | null }) {
  if (invoice.status === "void" || invoice.status === "waived") {
    const statusLabel = invoice.status === "void" ? "đã hủy" : "đã miễn";
    throw new LedgerError(
      "INVOICE_NOT_PAYABLE",
      `Hóa đơn này ${statusLabel} và không thể nhận thanh toán. Hãy khôi phục hóa đơn trước nếu cần thu lại.`
    );
  }
  if (invoice.status !== "unpaid" || invoice.transactionId) {
    throw new LedgerError("INVOICE_ALREADY_PAID", "Hóa đơn này đã được thanh toán.");
  }
}

async function writeAudit(
  tx: Prisma.TransactionClient,
  input: {
    actor: LedgerActor;
    action: string;
    entityType: "Transaction" | "MonthlyInvoice";
    entityId: string;
    reason?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  await tx.auditLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorUsername: input.actor.username.trim(),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: input.reason ?? null,
      metadata: input.metadata
    }
  });
}

/**
 * Assigns one unmatched transaction to one unpaid invoice.
 *
 * Both relation columns are written inside one serializable transaction. The
 * updateMany predicates are deliberate compare-and-set operations; reads alone
 * are never trusted as a claim on financial state.
 */
export async function assignTransactionToInvoice(
  input: AssignTransactionInput
): Promise<AssignTransactionResult> {
  assertActor(input.actor);
  const reason = optionalReason(input.reason);
  // Trang Giao dịch dựa vào matchOverrideReason để hiện "Gán lệch", nên luôn có giá trị khi cưỡng chế gán.
  const overrideReason = input.force ? reason ?? NO_OVERRIDE_REASON : null;

  return runSerializable(async (tx) => {
    const [transaction, invoice] = await Promise.all([
      tx.transaction.findUnique({
        where: { id: input.transactionId },
        select: {
          id: true,
          amount: true,
          transferredAt: true,
          paymentMethod: true,
          matchedInvoiceId: true,
          matchReason: true,
          resolvedAt: true,
          resolvedNote: true,
          reversedAt: true
        }
      }),
      tx.monthlyInvoice.findUnique({
        where: { id: input.invoiceId },
        select: { id: true, amount: true, status: true, transactionId: true }
      })
    ]);

    if (!transaction) {
      throw new LedgerError("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
    }
    if (!invoice) {
      throw new LedgerError("INVOICE_NOT_FOUND", "Không tìm thấy hóa đơn.");
    }

    assertTransactionAvailable(transaction);
    assertInvoiceAvailable(invoice);

    const amountDifference = transaction.amount - invoice.amount;
    if (amountDifference !== 0 && !input.force) {
      throw new LedgerError(
        "AMOUNT_MISMATCH",
        "Số tiền giao dịch không khớp hóa đơn. Hãy kiểm tra lại hoặc chọn gán lệch tiền."
      );
    }

    const matchedAt = new Date();
    const claimedTransaction = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        matchedInvoiceId: null,
        resolvedAt: null,
        reversedAt: null
      },
      data: {
        matchedInvoiceId: invoice.id,
        matchedAt,
        matchReason: "manual_assignment",
        matchOverrideReason: overrideReason
      }
    });

    if (claimedTransaction.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Giao dịch vừa được xử lý bởi thao tác khác."
      );
    }

    const claimedInvoice = await tx.monthlyInvoice.updateMany({
      where: { id: invoice.id, status: "unpaid", transactionId: null },
      data: {
        status: "paid",
        paidAt: transaction.transferredAt,
        transactionId: transaction.id,
        // Gán lệch tiền (force): doanh thu ghi theo số tiền thực nhận, không theo hóa đơn.
        paidAmount: transaction.amount
      }
    });

    if (claimedInvoice.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Hóa đơn vừa được thanh toán hoặc thay đổi bởi thao tác khác."
      );
    }

    await writeAudit(tx, {
      actor: input.actor,
      action: "transaction.assigned",
      entityType: "Transaction",
      entityId: transaction.id,
      reason,
      metadata: {
        invoiceId: invoice.id,
        transactionAmount: transaction.amount,
        invoiceAmount: invoice.amount,
        amountDifference,
        forced: Boolean(input.force),
        paymentMethod: transaction.paymentMethod,
        previousMatchReason: transaction.matchReason,
        previousResolvedNote: transaction.resolvedNote
      }
    });

    return {
      transactionId: transaction.id,
      invoiceId: invoice.id,
      occurredAt: matchedAt,
      forced: Boolean(input.force),
      amountDifference
    };
  });
}

/** Removes a valid match while preserving both records and the audit trail. */
export async function unassignTransaction(input: TransactionReasonInput): Promise<LedgerMutationResult> {
  assertActor(input.actor);
  const reason = optionalReason(input.reason);

  return runSerializable(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: input.transactionId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        matchedInvoiceId: true,
        matchedAt: true,
        matchReason: true,
        matchOverrideReason: true,
        resolvedAt: true,
        reversedAt: true
      }
    });

    if (!transaction) {
      throw new LedgerError("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
    }
    if (transaction.reversedAt) {
      throw new LedgerError("TRANSACTION_REVERSED", "Giao dịch này đã được hoàn tác.");
    }
    if (!transaction.matchedInvoiceId) {
      throw new LedgerError("TRANSACTION_NOT_MATCHED", "Giao dịch này chưa được gán cho hóa đơn.");
    }
    if (transaction.resolvedAt) {
      throw new LedgerError(
        "INCONSISTENT_LEDGER",
        "Giao dịch đang đồng thời ở trạng thái đã gán và đã xử lý. Cần kiểm tra dữ liệu."
      );
    }

    const invoice = await tx.monthlyInvoice.findUnique({
      where: { id: transaction.matchedInvoiceId },
      select: { id: true, status: true, transactionId: true }
    });
    if (!invoice || invoice.status !== "paid" || invoice.transactionId !== transaction.id) {
      throw new LedgerError(
        "INCONSISTENT_LEDGER",
        "Liên kết giữa giao dịch và hóa đơn không nhất quán. Cần đối soát trước khi bỏ gán."
      );
    }

    const releasedInvoice = await tx.monthlyInvoice.updateMany({
      where: { id: invoice.id, status: "paid", transactionId: transaction.id },
      data: { status: "unpaid", paidAt: null, transactionId: null, paidAmount: null }
    });
    if (releasedInvoice.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Hóa đơn vừa được thay đổi bởi thao tác khác."
      );
    }

    const releasedTransaction = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        matchedInvoiceId: invoice.id,
        resolvedAt: null,
        reversedAt: null
      },
      data: {
        matchedInvoiceId: null,
        matchedAt: null,
        matchReason: null,
        matchOverrideReason: null
      }
    });
    if (releasedTransaction.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Giao dịch vừa được thay đổi bởi thao tác khác."
      );
    }

    const occurredAt = new Date();
    await writeAudit(tx, {
      actor: input.actor,
      action: "transaction.unassigned",
      entityType: "Transaction",
      entityId: transaction.id,
      reason,
      metadata: {
        invoiceId: invoice.id,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        previousMatchedAt: transaction.matchedAt?.toISOString() ?? null,
        previousMatchReason: transaction.matchReason,
        previousMatchOverrideReason: transaction.matchOverrideReason
      }
    });

    return { transactionId: transaction.id, invoiceId: invoice.id, occurredAt };
  });
}

/**
 * Marks a transaction as reversed. If it paid an invoice, the invoice is first
 * returned to unpaid in the same serializable database transaction.
 */
export async function reverseTransaction(input: TransactionReasonInput): Promise<LedgerMutationResult> {
  assertActor(input.actor);
  const reason = optionalReason(input.reason);

  return runSerializable(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: input.transactionId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        matchedInvoiceId: true,
        matchedAt: true,
        matchReason: true,
        matchOverrideReason: true,
        resolvedAt: true,
        resolvedNote: true,
        reversedAt: true
      }
    });

    if (!transaction) {
      throw new LedgerError("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
    }
    if (transaction.reversedAt) {
      throw new LedgerError("TRANSACTION_REVERSED", "Giao dịch này đã được hoàn tác trước đó.");
    }

    const invoiceId = transaction.matchedInvoiceId;
    if (invoiceId) {
      const invoice = await tx.monthlyInvoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, status: true, transactionId: true }
      });
      if (!invoice || invoice.status !== "paid" || invoice.transactionId !== transaction.id) {
        throw new LedgerError(
          "INCONSISTENT_LEDGER",
          "Liên kết giữa giao dịch và hóa đơn không nhất quán. Cần đối soát trước khi hoàn tác."
        );
      }

      const releasedInvoice = await tx.monthlyInvoice.updateMany({
        where: { id: invoice.id, status: "paid", transactionId: transaction.id },
        data: { status: "unpaid", paidAt: null, transactionId: null, paidAmount: null }
      });
      if (releasedInvoice.count !== 1) {
        throw new LedgerError(
          "CONCURRENT_MODIFICATION",
          "Hóa đơn vừa được thay đổi bởi thao tác khác."
        );
      }
    }

    const reversedAt = new Date();
    const reversedTransaction = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        matchedInvoiceId: invoiceId,
        reversedAt: null
      },
      data: {
        matchedInvoiceId: null,
        matchedAt: null,
        matchReason: null,
        matchOverrideReason: null,
        // Giữ giao dịch khỏi hàng đợi unmatched nếu phải rollback tạm về app cũ,
        // vì phiên bản cũ chưa hiểu cột reversedAt.
        resolvedAt: reversedAt,
        resolvedNote: reason ? `Hoàn tác: ${reason}` : "Hoàn tác",
        reversedAt,
        reversalReason: reason
      }
    });
    if (reversedTransaction.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Giao dịch vừa được thay đổi bởi thao tác khác."
      );
    }

    await writeAudit(tx, {
      actor: input.actor,
      action: "transaction.reversed",
      entityType: "Transaction",
      entityId: transaction.id,
      reason,
      metadata: {
        invoiceId,
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod,
        wasResolved: Boolean(transaction.resolvedAt),
        previousMatchedAt: transaction.matchedAt?.toISOString() ?? null,
        previousMatchReason: transaction.matchReason,
        previousMatchOverrideReason: transaction.matchOverrideReason,
        previousResolvedNote: transaction.resolvedNote
      }
    });

    return { transactionId: transaction.id, invoiceId, occurredAt: reversedAt };
  });
}

/** Marks an unmatched transaction as reviewed without deleting financial data. */
export async function resolveUnmatchedTransaction(
  input: TransactionReasonInput
): Promise<LedgerMutationResult> {
  assertActor(input.actor);
  const reason = optionalReason(input.reason);

  return runSerializable(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: input.transactionId },
      select: {
        id: true,
        amount: true,
        paymentMethod: true,
        matchedInvoiceId: true,
        resolvedAt: true,
        reversedAt: true
      }
    });

    if (!transaction) {
      throw new LedgerError("TRANSACTION_NOT_FOUND", "Không tìm thấy giao dịch.");
    }
    assertTransactionAvailable(transaction);

    const resolvedAt = new Date();
    const resolved = await tx.transaction.updateMany({
      where: {
        id: transaction.id,
        matchedInvoiceId: null,
        resolvedAt: null,
        reversedAt: null
      },
      data: { resolvedAt, resolvedNote: reason }
    });
    if (resolved.count !== 1) {
      throw new LedgerError(
        "CONCURRENT_MODIFICATION",
        "Giao dịch vừa được xử lý bởi thao tác khác."
      );
    }

    await writeAudit(tx, {
      actor: input.actor,
      action: "transaction.resolved",
      entityType: "Transaction",
      entityId: transaction.id,
      reason,
      metadata: {
        amount: transaction.amount,
        paymentMethod: transaction.paymentMethod
      }
    });

    return { transactionId: transaction.id, invoiceId: null, occurredAt: resolvedAt };
  });
}
