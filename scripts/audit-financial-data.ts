import { PrismaClient } from "@prisma/client";

/**
 * Đối soát dữ liệu tài chính hiện tại.
 *
 * Script này chỉ dùng các truy vấn đọc (`findMany`) và tuyệt đối không ghi dữ liệu.
 * Exit code:
 *   0: không có lỗi nghiêm trọng (có thể vẫn có cảnh báo)
 *   1: phát hiện ít nhất một lỗi dữ liệu nghiêm trọng
 *   2: không thể hoàn tất kiểm tra (ví dụ không kết nối được DB)
 */

const prisma = new PrismaClient();
const MAX_SAMPLES_PER_CHECK = 12;
const FUTURE_TOLERANCE_MS = 24 * 60 * 60 * 1000;
const EARLIEST_PLAUSIBLE_DATE = new Date("2000-01-01T00:00:00.000Z");

type Severity = "critical" | "warning";

type FindingGroup = {
  code: string;
  severity: Severity;
  title: string;
  count: number;
  samples: string[];
};

class AuditFindings {
  private readonly groups = new Map<string, FindingGroup>();

  add(args: {
    code: string;
    severity: Severity;
    title: string;
    sample?: string;
  }) {
    const existing = this.groups.get(args.code);
    if (existing) {
      existing.count += 1;
      if (args.sample && existing.samples.length < MAX_SAMPLES_PER_CHECK) {
        existing.samples.push(args.sample);
      }
      return;
    }

    this.groups.set(args.code, {
      code: args.code,
      severity: args.severity,
      title: args.title,
      count: 1,
      samples: args.sample ? [args.sample] : []
    });
  }

  list(severity: Severity) {
    return [...this.groups.values()]
      .filter((group) => group.severity === severity)
      .sort((left, right) => left.code.localeCompare(right.code));
  }

  count(severity: Severity) {
    return this.list(severity).reduce((sum, group) => sum + group.count, 0);
  }
}

function formatMoney(amount: number) {
  return `${new Intl.NumberFormat("vi-VN").format(amount)} đ`;
}

function invoiceLabel(invoice: { id: string; month: number; year: number }) {
  return `invoiceId=${invoice.id} (T${invoice.month}/${invoice.year})`;
}

function transactionLabel(transaction: { id: string }) {
  // Không in gatewayRef, nội dung chuyển khoản hoặc rawPayload vì có thể chứa dữ liệu nhạy cảm.
  return `transactionId=${transaction.id}`;
}

function isValidDate(value: Date) {
  return Number.isFinite(value.getTime());
}

function printFindingSection(title: string, groups: FindingGroup[]) {
  console.log(`\n${title}`);
  if (groups.length === 0) {
    console.log("  Không phát hiện.");
    return;
  }

  for (const group of groups) {
    console.log(`  [${group.code}] ${group.title}: ${group.count}`);
    for (const sample of group.samples) {
      console.log(`    - ${sample}`);
    }
    if (group.count > group.samples.length) {
      console.log(`    - ... và ${group.count - group.samples.length} bản ghi khác`);
    }
  }
}

async function main() {
  const now = new Date();
  const maxPlausibleYear = now.getUTCFullYear() + 1;
  const findings = new AuditFindings();

  // Hai truy vấn bên dưới là toàn bộ phần truy cập DB của script; đều là READ-ONLY.
  const [invoices, transactions] = await Promise.all([
    prisma.monthlyInvoice.findMany({
      select: {
        id: true,
        month: true,
        year: true,
        sessions: true,
        pricePerSession: true,
        amount: true,
        status: true,
        statusReason: true,
        statusChangedAt: true,
        paidAt: true,
        transactionId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }]
    }),
    prisma.transaction.findMany({
      select: {
        id: true,
        amount: true,
        transferredAt: true,
        paymentMethod: true,
        matchedInvoiceId: true,
        matchedAt: true,
        matchReason: true,
        matchOverrideReason: true,
        resolvedAt: true,
        resolvedNote: true,
        reversedAt: true,
        reversalReason: true,
        createdAt: true
      },
      orderBy: [{ transferredAt: "asc" }, { id: "asc" }]
    })
  ]);

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const transactionById = new Map(
    transactions.map((transaction) => [transaction.id, transaction])
  );
  const invoicesByTransactionId = new Map<string, typeof invoices>();
  const transactionsByInvoiceId = new Map<string, typeof transactions>();

  for (const invoice of invoices) {
    if (!invoice.transactionId) continue;
    const current = invoicesByTransactionId.get(invoice.transactionId) ?? [];
    current.push(invoice);
    invoicesByTransactionId.set(invoice.transactionId, current);
  }

  for (const transaction of transactions) {
    if (!transaction.matchedInvoiceId) continue;
    const current = transactionsByInvoiceId.get(transaction.matchedInvoiceId) ?? [];
    current.push(transaction);
    transactionsByInvoiceId.set(transaction.matchedInvoiceId, current);
  }

  for (const invoice of invoices) {
    const label = invoiceLabel(invoice);
    const matchingTransactions = transactionsByInvoiceId.get(invoice.id) ?? [];
    const pointedTransaction = invoice.transactionId
      ? transactionById.get(invoice.transactionId)
      : undefined;
    const expectedAmount = invoice.sessions * invoice.pricePerSession;

    if (!Number.isInteger(invoice.month) || invoice.month < 1 || invoice.month > 12) {
      findings.add({
        code: "INV_INVALID_MONTH",
        severity: "critical",
        title: "Hóa đơn có tháng không hợp lệ",
        sample: `${label}: month=${invoice.month}`
      });
    }

    if (
      !Number.isInteger(invoice.year) ||
      invoice.year < 2000 ||
      invoice.year > maxPlausibleYear
    ) {
      findings.add({
        code: "INV_IMPLAUSIBLE_YEAR",
        severity: "warning",
        title: "Hóa đơn có năm cần kiểm tra lại",
        sample: `${label}: year=${invoice.year}`
      });
    }

    if (!Number.isInteger(invoice.sessions) || invoice.sessions <= 0) {
      findings.add({
        code: "INV_INVALID_SESSIONS",
        severity: "critical",
        title: "Hóa đơn có số buổi không hợp lệ",
        sample: `${label}: sessions=${invoice.sessions}`
      });
    }

    if (!Number.isInteger(invoice.pricePerSession) || invoice.pricePerSession <= 0) {
      findings.add({
        code: "INV_INVALID_UNIT_PRICE",
        severity: "critical",
        title: "Hóa đơn có đơn giá không hợp lệ",
        sample: `${label}: pricePerSession=${formatMoney(invoice.pricePerSession)}`
      });
    }

    if (!Number.isInteger(invoice.amount) || invoice.amount <= 0) {
      findings.add({
        code: "INV_INVALID_AMOUNT",
        severity: "critical",
        title: "Hóa đơn có tổng tiền không hợp lệ",
        sample: `${label}: amount=${formatMoney(invoice.amount)}`
      });
    }

    if (invoice.amount !== expectedAmount) {
      findings.add({
        code: "INV_AMOUNT_FORMULA_MISMATCH",
        severity: "critical",
        title: "Tổng hóa đơn khác số buổi × đơn giá",
        sample: `${label}: lưu ${formatMoney(invoice.amount)}, tính lại ${formatMoney(expectedAmount)}`
      });
    }

    if (!isValidDate(invoice.createdAt) || !isValidDate(invoice.updatedAt)) {
      findings.add({
        code: "INV_INVALID_SYSTEM_DATE",
        severity: "critical",
        title: "Hóa đơn có ngày hệ thống không hợp lệ",
        sample: label
      });
    } else {
      if (invoice.updatedAt.getTime() < invoice.createdAt.getTime()) {
        findings.add({
          code: "INV_UPDATED_BEFORE_CREATED",
          severity: "critical",
          title: "Hóa đơn được cập nhật trước ngày tạo",
          sample: label
        });
      }
      if (invoice.createdAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        findings.add({
          code: "INV_FUTURE_CREATED_AT",
          severity: "warning",
          title: "Hóa đơn có ngày tạo ở tương lai",
          sample: label
        });
      }
    }

    if (invoice.paidAt && !isValidDate(invoice.paidAt)) {
      findings.add({
        code: "INV_INVALID_PAID_AT",
        severity: "critical",
        title: "Hóa đơn có ngày thanh toán không hợp lệ",
        sample: label
      });
    } else if (invoice.paidAt) {
      if (invoice.paidAt < EARLIEST_PLAUSIBLE_DATE) {
        findings.add({
          code: "INV_IMPLAUSIBLE_PAID_AT",
          severity: "warning",
          title: "Hóa đơn có ngày thanh toán quá cũ",
          sample: label
        });
      }
      if (invoice.paidAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        findings.add({
          code: "INV_FUTURE_PAID_AT",
          severity: "warning",
          title: "Hóa đơn có ngày thanh toán ở tương lai",
          sample: label
        });
      }
    }

    if (invoice.statusChangedAt && !isValidDate(invoice.statusChangedAt)) {
      findings.add({
        code: "INV_INVALID_STATUS_CHANGED_AT",
        severity: "critical",
        title: "Hóa đơn có ngày đổi trạng thái không hợp lệ",
        sample: label
      });
    } else if (
      invoice.statusChangedAt &&
      invoice.statusChangedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS
    ) {
      findings.add({
        code: "INV_FUTURE_STATUS_CHANGED_AT",
        severity: "warning",
        title: "Hóa đơn có ngày đổi trạng thái ở tương lai",
        sample: label
      });
    }

    const hasAnyTransactionLink = Boolean(invoice.transactionId) || matchingTransactions.length > 0;

    if (invoice.status === "paid") {
      if (!invoice.paidAt) {
        findings.add({
          code: "INV_PAID_WITHOUT_PAID_AT",
          severity: "critical",
          title: "Hóa đơn đã đóng nhưng thiếu ngày thanh toán",
          sample: label
        });
      }
      if (!hasAnyTransactionLink) {
        findings.add({
          code: "INV_PAID_WITHOUT_TRANSACTION",
          severity: "critical",
          title: "Hóa đơn đã đóng nhưng không có giao dịch liên kết",
          sample: label
        });
      }
    } else if (invoice.status === "unpaid") {
      if (invoice.paidAt) {
        findings.add({
          code: "INV_UNPAID_WITH_PAID_AT",
          severity: "critical",
          title: "Hóa đơn chưa đóng nhưng lại có ngày thanh toán",
          sample: label
        });
      }
      if (hasAnyTransactionLink) {
        findings.add({
          code: "INV_UNPAID_WITH_TRANSACTION",
          severity: "critical",
          title: "Hóa đơn chưa đóng nhưng đang liên kết giao dịch",
          sample: label
        });
      }
    } else {
      if (invoice.paidAt || hasAnyTransactionLink) {
        findings.add({
          code: "INV_NONPAYABLE_WITH_PAYMENT_DATA",
          severity: "critical",
          title: "Hóa đơn đã miễn/hủy nhưng vẫn còn dữ liệu thanh toán",
          sample: `${label}: status=${invoice.status}`
        });
      }

      if (!invoice.statusReason?.trim() || !invoice.statusChangedAt) {
        findings.add({
          code: "INV_LIFECYCLE_AUDIT_INCOMPLETE",
          severity: "warning",
          title: "Hóa đơn đã miễn/hủy thiếu lý do hoặc thời điểm đổi trạng thái",
          sample: `${label}: status=${invoice.status}`
        });
      }
    }

    if (invoice.transactionId && !pointedTransaction) {
      findings.add({
        code: "INV_POINTS_TO_MISSING_TRANSACTION",
        severity: "critical",
        title: "Hóa đơn trỏ tới giao dịch không tồn tại",
        sample: `${label}: transactionId=${invoice.transactionId}`
      });
    } else if (
      invoice.transactionId &&
      pointedTransaction &&
      pointedTransaction.matchedInvoiceId !== invoice.id
    ) {
      findings.add({
        code: "INV_TX_BACKPOINTER_MISMATCH",
        severity: "critical",
        title: "Hóa đơn và giao dịch không trỏ ngược đúng nhau",
        sample: `${label}, ${transactionLabel(pointedTransaction)}`
      });
    }
  }

  const checkedAmountPairs = new Set<string>();
  const paymentMethodCounts = { bank_transfer: 0, cash: 0 };
  const transactionStateCounts = { open: 0, matched: 0, resolved: 0, reversed: 0 };

  function checkMatchedAmount(
    transaction: (typeof transactions)[number],
    invoice: (typeof invoices)[number]
  ) {
    const pairKey = `${transaction.id}:${invoice.id}`;
    if (checkedAmountPairs.has(pairKey) || transaction.amount === invoice.amount) return;

    checkedAmountPairs.add(pairKey);
    const hasApprovedOverride = Boolean(transaction.matchOverrideReason?.trim());
    findings.add({
      code: hasApprovedOverride ? "TX_INVOICE_AMOUNT_OVERRIDE" : "TX_INVOICE_AMOUNT_MISMATCH",
      severity: hasApprovedOverride ? "warning" : "critical",
      title: hasApprovedOverride
        ? "Giao dịch được cưỡng chế khớp lệch tiền và có lưu lý do"
        : "Số tiền giao dịch khác số tiền hóa đơn nhưng thiếu lý do cưỡng chế",
      sample: `${transactionLabel(transaction)}, ${invoiceLabel(invoice)}: giao dịch ${formatMoney(transaction.amount)}, hóa đơn ${formatMoney(invoice.amount)}`
    });
  }

  for (const transaction of transactions) {
    const label = transactionLabel(transaction);
    const referencedInvoices = invoicesByTransactionId.get(transaction.id) ?? [];
    const matchedInvoice = transaction.matchedInvoiceId
      ? invoiceById.get(transaction.matchedInvoiceId)
      : undefined;
    const isReversed = Boolean(transaction.reversedAt);
    const isMatched = Boolean(transaction.matchedInvoiceId);
    const isResolved = Boolean(transaction.resolvedAt) && !isReversed;

    paymentMethodCounts[transaction.paymentMethod] += 1;
    if (isReversed) transactionStateCounts.reversed += 1;
    else if (isMatched) transactionStateCounts.matched += 1;
    else if (isResolved) transactionStateCounts.resolved += 1;
    else transactionStateCounts.open += 1;

    if (!Number.isInteger(transaction.amount) || transaction.amount <= 0) {
      findings.add({
        code: "TX_INVALID_AMOUNT",
        severity: "critical",
        title: "Giao dịch có số tiền không hợp lệ",
        sample: `${label}: amount=${formatMoney(transaction.amount)}`
      });
    }

    if (!isValidDate(transaction.transferredAt) || !isValidDate(transaction.createdAt)) {
      findings.add({
        code: "TX_INVALID_DATE",
        severity: "critical",
        title: "Giao dịch có ngày không hợp lệ",
        sample: label
      });
    } else {
      if (transaction.transferredAt < EARLIEST_PLAUSIBLE_DATE) {
        findings.add({
          code: "TX_IMPLAUSIBLE_TRANSFER_DATE",
          severity: "warning",
          title: "Giao dịch có ngày chuyển tiền quá cũ",
          sample: label
        });
      }
      if (transaction.transferredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        findings.add({
          code: "TX_FUTURE_TRANSFER_DATE",
          severity: "warning",
          title: "Giao dịch có ngày chuyển tiền ở tương lai",
          sample: label
        });
      }
      if (transaction.createdAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) {
        findings.add({
          code: "TX_FUTURE_CREATED_AT",
          severity: "warning",
          title: "Giao dịch có ngày tạo ở tương lai",
          sample: label
        });
      }
    }

    if (transaction.resolvedAt && !isValidDate(transaction.resolvedAt)) {
      findings.add({
        code: "TX_INVALID_RESOLVED_AT",
        severity: "critical",
        title: "Giao dịch có ngày xử lý không hợp lệ",
        sample: label
      });
    } else if (
      transaction.resolvedAt &&
      transaction.resolvedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS
    ) {
      findings.add({
        code: "TX_FUTURE_RESOLVED_AT",
        severity: "warning",
        title: "Giao dịch có ngày xử lý ở tương lai",
        sample: label
      });
    }

    if (transaction.matchedAt && !isValidDate(transaction.matchedAt)) {
      findings.add({
        code: "TX_INVALID_MATCHED_AT",
        severity: "critical",
        title: "Giao dịch có ngày khớp không hợp lệ",
        sample: label
      });
    } else if (
      transaction.matchedAt &&
      transaction.matchedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS
    ) {
      findings.add({
        code: "TX_FUTURE_MATCHED_AT",
        severity: "warning",
        title: "Giao dịch có ngày khớp ở tương lai",
        sample: label
      });
    }

    if (transaction.reversedAt && !isValidDate(transaction.reversedAt)) {
      findings.add({
        code: "TX_INVALID_REVERSED_AT",
        severity: "critical",
        title: "Giao dịch có ngày hoàn tác không hợp lệ",
        sample: label
      });
    } else if (
      transaction.reversedAt &&
      transaction.reversedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS
    ) {
      findings.add({
        code: "TX_FUTURE_REVERSED_AT",
        severity: "warning",
        title: "Giao dịch có ngày hoàn tác ở tương lai",
        sample: label
      });
    }

    if (transaction.matchedInvoiceId && transaction.reversedAt) {
      findings.add({
        code: "TX_MATCHED_AND_REVERSED",
        severity: "critical",
        title: "Giao dịch đã hoàn tác nhưng vẫn còn liên kết hóa đơn",
        sample: label
      });
    } else if (transaction.matchedInvoiceId && transaction.resolvedAt) {
      findings.add({
        code: "TX_MATCHED_AND_RESOLVED",
        severity: "critical",
        title: "Giao dịch vừa được khớp vừa được đánh dấu đã xử lý",
        sample: label
      });
    }

    if (transaction.reversedAt) {
      if (!transaction.resolvedAt) {
        findings.add({
          code: "TX_REVERSED_WITHOUT_RESOLVED_AT",
          severity: "critical",
          title: "Giao dịch hoàn tác thiếu dấu đã xử lý tương thích",
          sample: label
        });
      } else if (transaction.resolvedAt.getTime() !== transaction.reversedAt.getTime()) {
        findings.add({
          code: "TX_REVERSED_TIMESTAMP_MISMATCH",
          severity: "warning",
          title: "Thời điểm hoàn tác và thời điểm xử lý của giao dịch khác nhau",
          sample: label
        });
      }

      if (!transaction.reversalReason?.trim()) {
        findings.add({
          code: "TX_REVERSED_WITHOUT_REASON",
          severity: "critical",
          title: "Giao dịch đã hoàn tác nhưng thiếu lý do",
          sample: label
        });
      }

      if (
        transaction.matchedAt ||
        transaction.matchReason ||
        transaction.matchOverrideReason
      ) {
        findings.add({
          code: "TX_REVERSED_WITH_STALE_MATCH_DATA",
          severity: "warning",
          title: "Giao dịch hoàn tác vẫn còn metadata của lần khớp",
          sample: label
        });
      }

      if (referencedInvoices.length > 0) {
        findings.add({
          code: "TX_REVERSED_STILL_REFERENCED",
          severity: "critical",
          title: "Giao dịch hoàn tác vẫn được hóa đơn sử dụng",
          sample: label
        });
      }
    } else {
      if (transaction.reversalReason?.trim()) {
        findings.add({
          code: "TX_REVERSAL_REASON_WITHOUT_REVERSAL",
          severity: "warning",
          title: "Giao dịch chưa hoàn tác nhưng lại có lý do hoàn tác",
          sample: label
        });
      }

      if (transaction.matchedInvoiceId) {
        if (!transaction.matchedAt) {
          findings.add({
            code: "TX_MATCHED_WITHOUT_MATCHED_AT",
            severity: "critical",
            title: "Giao dịch đã khớp nhưng thiếu thời điểm khớp",
            sample: label
          });
        }
        if (!transaction.matchReason?.trim()) {
          findings.add({
            code: "TX_MATCHED_WITHOUT_REASON",
            severity: "warning",
            title: "Giao dịch đã khớp nhưng thiếu nguồn/lý do khớp",
            sample: label
          });
        }
      } else {
        if (transaction.matchedAt || transaction.matchOverrideReason) {
          findings.add({
            code: "TX_UNMATCHED_WITH_STALE_MATCH_DATA",
            severity: "warning",
            title: "Giao dịch chưa khớp vẫn còn metadata của lần khớp",
            sample: label
          });
        }
        if (transaction.resolvedAt && !transaction.resolvedNote?.trim()) {
          findings.add({
            code: "TX_RESOLVED_WITHOUT_NOTE",
            severity: "warning",
            title: "Giao dịch đã xử lý nhưng thiếu ghi chú xử lý",
            sample: label
          });
        }
        if (transaction.paymentMethod === "cash" && !transaction.resolvedAt) {
          findings.add({
            code: "TX_UNMATCHED_CASH",
            severity: "warning",
            title: "Giao dịch tiền mặt đang mở nhưng chưa liên kết hóa đơn",
            sample: label
          });
        }
      }
    }

    if (transaction.matchedInvoiceId && !matchedInvoice) {
      findings.add({
        code: "TX_POINTS_TO_MISSING_INVOICE",
        severity: "critical",
        title: "Giao dịch trỏ tới hóa đơn không tồn tại",
        sample: `${label}: invoiceId=${transaction.matchedInvoiceId}`
      });
    } else if (matchedInvoice) {
      if (matchedInvoice.transactionId !== transaction.id) {
        findings.add({
          code: "TX_INV_BACKPOINTER_MISMATCH",
          severity: "critical",
          title: "Giao dịch và hóa đơn không trỏ ngược đúng nhau",
          sample: `${label}, ${invoiceLabel(matchedInvoice)}`
        });
      }

      if (matchedInvoice.status !== "paid") {
        findings.add({
          code: "TX_MATCHED_TO_NONPAID_INVOICE",
          severity: "critical",
          title: "Giao dịch đã khớp vào hóa đơn không ở trạng thái đã đóng",
          sample: `${label}, ${invoiceLabel(matchedInvoice)}`
        });
      }

      checkMatchedAmount(transaction, matchedInvoice);
    }

    for (const invoice of referencedInvoices) {
      checkMatchedAmount(transaction, invoice);
    }
  }

  for (const [transactionId, linkedInvoices] of invoicesByTransactionId) {
    if (linkedInvoices.length <= 1) continue;
    findings.add({
      code: "TX_USED_BY_MULTIPLE_INVOICES",
      severity: "critical",
      title: "Một giao dịch được dùng bởi nhiều hóa đơn",
      sample: `transactionId=${transactionId}: ${linkedInvoices.length} hóa đơn (${linkedInvoices
        .map((invoice) => invoice.id)
        .join(", ")})`
    });
  }

  for (const [invoiceId, matchedTransactions] of transactionsByInvoiceId) {
    if (matchedTransactions.length <= 1) continue;
    findings.add({
      code: "INV_MATCHED_BY_MULTIPLE_TRANSACTIONS",
      severity: "critical",
      title: "Một hóa đơn được nhiều giao dịch cùng nhận là đã khớp",
      sample: `invoiceId=${invoiceId}: ${matchedTransactions.length} giao dịch (${matchedTransactions
        .map((transaction) => transaction.id)
        .join(", ")})`
    });
  }

  const criticalGroups = findings.list("critical");
  const warningGroups = findings.list("warning");
  const criticalCount = findings.count("critical");
  const warningCount = findings.count("warning");
  const invoiceStatusCounts = {
    unpaid: invoices.filter((invoice) => invoice.status === "unpaid").length,
    paid: invoices.filter((invoice) => invoice.status === "paid").length,
    void: invoices.filter((invoice) => invoice.status === "void").length,
    waived: invoices.filter((invoice) => invoice.status === "waived").length
  };

  console.log("============================================================");
  console.log("ĐỐI SOÁT DỮ LIỆU TÀI CHÍNH (CHỈ ĐỌC)");
  console.log("============================================================");
  console.log(`Hóa đơn đã đọc:   ${invoices.length}`);
  console.log(`Giao dịch đã đọc: ${transactions.length}`);
  console.log("Không có dữ liệu nào được thay đổi.");

  printFindingSection(`LỖI NGHIÊM TRỌNG (${criticalCount})`, criticalGroups);
  printFindingSection(`CẢNH BÁO CẦN XEM LẠI (${warningCount})`, warningGroups);

  console.log("\nTRẠNG THÁI HÓA ĐƠN");
  console.log(`  Chưa đóng: ${invoiceStatusCounts.unpaid}`);
  console.log(`  Đã đóng:   ${invoiceStatusCounts.paid}`);
  console.log(`  Đã hủy:    ${invoiceStatusCounts.void}`);
  console.log(`  Đã miễn:   ${invoiceStatusCounts.waived}`);

  console.log("\nPHƯƠNG THỨC THANH TOÁN (THEO TRƯỜNG paymentMethod)");
  console.log(`  Chuyển khoản: ${paymentMethodCounts.bank_transfer}`);
  console.log(`  Tiền mặt:     ${paymentMethodCounts.cash}`);

  console.log("\nTRẠNG THÁI GIAO DỊCH");
  console.log(`  Đang chờ xử lý: ${transactionStateCounts.open}`);
  console.log(`  Đã khớp:        ${transactionStateCounts.matched}`);
  console.log(`  Đã xử lý:       ${transactionStateCounts.resolved}`);
  console.log(`  Đã hoàn tác:    ${transactionStateCounts.reversed}`);

  console.log("\nKẾT LUẬN");
  if (criticalCount > 0) {
    console.log(
      `  KHÔNG ĐẠT: phát hiện ${criticalCount} lỗi nghiêm trọng trong ${criticalGroups.length} nhóm.`
    );
    console.log("  Cần đối soát/sửa dữ liệu trước khi siết unique constraint hoặc migration sổ giao dịch.");
    process.exitCode = 1;
  } else {
    console.log("  ĐẠT: không phát hiện lỗi dữ liệu nghiêm trọng.");
    if (warningCount > 0) {
      console.log(`  Có ${warningCount} cảnh báo nên xem lại trước khi migration.`);
    }
  }
}

function safeErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return "UNKNOWN";
  const candidate = error as { code?: unknown; errorCode?: unknown };
  for (const value of [candidate.code, candidate.errorCode]) {
    if (typeof value === "string" && /^[A-Z0-9_-]+$/i.test(value)) return value;
  }
  return "UNKNOWN";
}

main()
  .catch((error: unknown) => {
    // Không in nguyên error/message để tránh vô tình lộ connection string hoặc secret.
    console.error(`Không thể hoàn tất đối soát (mã lỗi: ${safeErrorCode(error)}).`);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
