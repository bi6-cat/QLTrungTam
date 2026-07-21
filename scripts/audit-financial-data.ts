import { Prisma, PrismaClient } from "@prisma/client";

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

function isJsonObject(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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
        paidAt: true,
        transactionId: true,
        createdAt: true,
        updatedAt: true,
        enrollment: {
          select: { status: true }
        }
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { id: "asc" }]
    }),
    prisma.transaction.findMany({
      select: {
        id: true,
        gatewayRef: true,
        amount: true,
        rawContent: true,
        transferredAt: true,
        matchedInvoiceId: true,
        rawPayload: true,
        resolvedAt: true,
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
    } else {
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

      if (invoice.enrollment.status === "on_leave") {
        findings.add({
          code: "INV_UNPAID_ON_LEAVE",
          severity: "warning",
          title: "Hóa đơn chưa đóng thuộc học sinh đang bảo lưu",
          sample: label
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

  for (const transaction of transactions) {
    const label = transactionLabel(transaction);
    const referencedInvoices = invoicesByTransactionId.get(transaction.id) ?? [];
    const matchedInvoice = transaction.matchedInvoiceId
      ? invoiceById.get(transaction.matchedInvoiceId)
      : undefined;

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

    if (transaction.matchedInvoiceId && transaction.resolvedAt) {
      findings.add({
        code: "TX_MATCHED_AND_RESOLVED",
        severity: "critical",
        title: "Giao dịch vừa được khớp vừa được đánh dấu đã xử lý",
        sample: label
      });
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
          code: "TX_MATCHED_TO_UNPAID_INVOICE",
          severity: "critical",
          title: "Giao dịch đã khớp vào hóa đơn chưa đóng",
          sample: `${label}, ${invoiceLabel(matchedInvoice)}`
        });
      }

      const pairKey = `${transaction.id}:${matchedInvoice.id}`;
      if (!checkedAmountPairs.has(pairKey) && transaction.amount !== matchedInvoice.amount) {
        checkedAmountPairs.add(pairKey);
        findings.add({
          code: "TX_INVOICE_AMOUNT_MISMATCH",
          severity: "critical",
          title: "Số tiền giao dịch khác số tiền hóa đơn được khớp",
          sample: `${label}, ${invoiceLabel(matchedInvoice)}: giao dịch ${formatMoney(transaction.amount)}, hóa đơn ${formatMoney(matchedInvoice.amount)}`
        });
      }
    }

    for (const invoice of referencedInvoices) {
      const pairKey = `${transaction.id}:${invoice.id}`;
      if (!checkedAmountPairs.has(pairKey) && transaction.amount !== invoice.amount) {
        checkedAmountPairs.add(pairKey);
        findings.add({
          code: "TX_INVOICE_AMOUNT_MISMATCH",
          severity: "critical",
          title: "Số tiền giao dịch khác số tiền hóa đơn được khớp",
          sample: `${label}, ${invoiceLabel(invoice)}: giao dịch ${formatMoney(transaction.amount)}, hóa đơn ${formatMoney(invoice.amount)}`
        });
      }
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

  const cashCandidates: Array<{ id: string; confidence: "cao" | "cần xem lại" }> = [];
  let bankCandidates = 0;

  for (const transaction of transactions) {
    const payload = isJsonObject(transaction.rawPayload) ? transaction.rawPayload : undefined;
    const payloadMethod = jsonString(payload?.method);
    const payloadSource = jsonString(payload?.source);
    const gatewaySaysCash = /^cash-/i.test(transaction.gatewayRef);
    const payloadSaysCash = payloadMethod === "cash";
    const contentSaysCash = normalizeText(transaction.rawContent).includes("tien mat");
    const sourceSaysManual = payloadSource === "admin_manual";
    const signalCount = [gatewaySaysCash, payloadSaysCash, contentSaysCash, sourceSaysManual].filter(
      Boolean
    ).length;
    const isCashCandidate = signalCount > 0;

    if (isCashCandidate) {
      cashCandidates.push({
        id: transaction.id,
        confidence: gatewaySaysCash && (payloadSaysCash || sourceSaysManual) ? "cao" : "cần xem lại"
      });
    } else {
      bankCandidates += 1;
    }

    if (gatewaySaysCash && payloadMethod && !payloadSaysCash) {
      findings.add({
        code: "TX_CASH_MARKER_CONFLICT",
        severity: "warning",
        title: "Dấu hiệu phân loại tiền mặt trong giao dịch bị mâu thuẫn",
        sample: transactionLabel(transaction)
      });
    }

    if (isCashCandidate && !transaction.matchedInvoiceId && (invoicesByTransactionId.get(transaction.id) ?? []).length === 0) {
      findings.add({
        code: "TX_UNMATCHED_CASH_CANDIDATE",
        severity: "warning",
        title: "Ứng viên giao dịch tiền mặt chưa liên kết hóa đơn",
        sample: transactionLabel(transaction)
      });
    }
  }

  const criticalGroups = findings.list("critical");
  const warningGroups = findings.list("warning");
  const criticalCount = findings.count("critical");
  const warningCount = findings.count("warning");
  const highConfidenceCash = cashCandidates.filter((candidate) => candidate.confidence === "cao");
  const reviewCash = cashCandidates.filter((candidate) => candidate.confidence === "cần xem lại");

  console.log("============================================================");
  console.log("ĐỐI SOÁT DỮ LIỆU TÀI CHÍNH (CHỈ ĐỌC)");
  console.log("============================================================");
  console.log(`Hóa đơn đã đọc:   ${invoices.length}`);
  console.log(`Giao dịch đã đọc: ${transactions.length}`);
  console.log("Không có dữ liệu nào được thay đổi.");

  printFindingSection(`LỖI NGHIÊM TRỌNG (${criticalCount})`, criticalGroups);
  printFindingSection(`CẢNH BÁO CẦN XEM LẠI (${warningCount})`, warningGroups);

  console.log("\nỨNG VIÊN BACKFILL PHƯƠNG THỨC THANH TOÁN");
  console.log(`  Tiền mặt - độ tin cậy cao: ${highConfidenceCash.length}`);
  console.log(`  Tiền mặt - cần xem lại:    ${reviewCash.length}`);
  console.log(`  Chuyển khoản dự kiến:      ${bankCandidates}`);
  if (cashCandidates.length > 0) {
    console.log("  Mẫu ứng viên tiền mặt (chỉ in ID nội bộ):");
    for (const candidate of cashCandidates.slice(0, MAX_SAMPLES_PER_CHECK)) {
      console.log(`    - transactionId=${candidate.id} (${candidate.confidence})`);
    }
    if (cashCandidates.length > MAX_SAMPLES_PER_CHECK) {
      console.log(
        `    - ... và ${cashCandidates.length - MAX_SAMPLES_PER_CHECK} ứng viên khác`
      );
    }
  }

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
