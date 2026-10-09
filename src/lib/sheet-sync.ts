import { prisma } from "@/lib/prisma";
import {
  enrollmentVisibleInPeriodWhere,
  latestMonthUpToPeriodArgs,
  periodIndex,
  resolveMonthPlan
} from "@/lib/enrollment-period";
import { getMonthlyFinance } from "@/lib/finance";
import { formatMonth } from "@/lib/format";
import { batchUpdateSpreadsheet, listSheetTabs, parseServiceAccount } from "@/lib/google-sheets";
import { salaryLineNotes } from "@/lib/salary";
import { expenseCategoryLabel } from "@/lib/schedule";
import { buildTabRequests, monthTabTitle, pickSheetId, sheetSection, type Cell, type SheetRow } from "@/lib/sheet-layout";
import { describeTransaction } from "@/lib/transaction-report";

/**
 * Đồng bộ toàn bộ dữ liệu phát sinh theo tháng sang Google Sheet để lưu trữ: mỗi tháng một tab
 * gồm Tổng hợp, Học phí & số buổi, Giao dịch, Lương giáo viên và Chi phí. Database vẫn là dữ
 * liệu gốc; sheet chỉ là bản sao, mỗi lần đồng bộ ghi đè cả tab.
 */

const KEYS = {
  spreadsheetId: "GOOGLE_SHEET_ID",
  serviceAccount: "GOOGLE_SERVICE_ACCOUNT_JSON",
  status: "GOOGLE_SHEET_SYNC_STATUS"
} as const;

/** Giờ chạy đồng bộ tự động hằng đêm (giờ máy chủ, Asia/Ho_Chi_Minh). */
export const NIGHTLY_SYNC_HOUR = 2;

export type SheetSyncTrigger = "nightly" | "manual";
export type SheetSyncStatus = {
  at: string;
  ok: boolean;
  message: string;
  trigger: SheetSyncTrigger;
  /** Mốc bắt đầu của lần đồng bộ thành công gần nhất: dữ liệu sửa sau mốc này sẽ được đồng bộ lại. */
  lastSuccessAt: string | null;
  /** Ngày (YYYY-MM-DD) đã chạy xong lượt tự động hằng đêm. */
  nightlyDate: string | null;
};

type Period = { month: number; year: number };

const INVOICE_STATUS_LABEL = { paid: "Đã đóng", unpaid: "Chưa đóng", waived: "Đã miễn", void: "Đã hủy" } as const;
const collator = new Intl.Collator("vi");

export function localDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseStatus(value: string | undefined): SheetSyncStatus | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as SheetSyncStatus;
  } catch {
    return null;
  }
}

export async function getSheetSyncConfig() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(KEYS) } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const serviceAccountJson = byKey.get(KEYS.serviceAccount) ?? "";
  let clientEmail = "";
  try {
    clientEmail = serviceAccountJson ? parseServiceAccount(serviceAccountJson).clientEmail : "";
  } catch {
    clientEmail = "";
  }
  const spreadsheetId = byKey.get(KEYS.spreadsheetId) ?? "";
  return {
    spreadsheetId,
    serviceAccountJson,
    clientEmail,
    configured: Boolean(spreadsheetId && clientEmail),
    status: parseStatus(byKey.get(KEYS.status))
  };
}

export async function saveSheetSyncConfig(input: { spreadsheetId: string; serviceAccountJson: string }) {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: KEYS.spreadsheetId },
      update: { value: input.spreadsheetId },
      create: { key: KEYS.spreadsheetId, value: input.spreadsheetId }
    }),
    prisma.appSetting.upsert({
      where: { key: KEYS.serviceAccount },
      update: { value: input.serviceAccountJson },
      create: { key: KEYS.serviceAccount, value: input.serviceAccountJson }
    })
  ]);
}

async function saveStatus(status: SheetSyncStatus) {
  const value = JSON.stringify(status);
  await prisma.appSetting.upsert({
    where: { key: KEYS.status },
    update: { value },
    create: { key: KEYS.status, value }
  });
}

// ---------------------------------------------------------------------------
// Chọn tháng cần đồng bộ
// ---------------------------------------------------------------------------

function previousPeriod({ month, year }: Period): Period {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year };
}

function uniquePeriods(periods: Period[]) {
  const byIndex = new Map(periods.map((period) => [periodIndex(period.month, period.year), period]));
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, period]) => period);
}

/** Tháng hiện tại, tháng trước và mọi tháng có dữ liệu bị sửa từ lần đồng bộ thành công trước. */
async function recentPeriods(now: Date, since: Date | null) {
  const current = { month: now.getMonth() + 1, year: now.getFullYear() };
  const periods: Period[] = [current, previousPeriod(current)];
  if (since) {
    const changed = { updatedAt: { gte: since } };
    const [invoices, months, expenses, transactions] = await Promise.all([
      prisma.monthlyInvoice.findMany({ where: changed, distinct: ["month", "year"], select: { month: true, year: true } }),
      prisma.enrollmentMonth.findMany({ where: changed, distinct: ["month", "year"], select: { month: true, year: true } }),
      prisma.expense.findMany({ where: changed, distinct: ["month", "year"], select: { month: true, year: true } }),
      prisma.transaction.findMany({ where: { createdAt: { gte: since } }, select: { transferredAt: true } })
    ]);
    periods.push(...invoices, ...months, ...expenses);
    for (const { transferredAt } of transactions) {
      periods.push({ month: transferredAt.getMonth() + 1, year: transferredAt.getFullYear() });
    }
  }
  // Không ghi tab cho tháng tương lai (hóa đơn tạo trước) quá xa; tối đa tới tháng sau.
  const limit = periodIndex(current.month, current.year) + 1;
  return uniquePeriods(periods).filter((period) => periodIndex(period.month, period.year) <= limit);
}

/** Từ tháng có dữ liệu sớm nhất tới tháng hiện tại. */
async function allPeriods(now: Date) {
  const byPeriod = { orderBy: [{ year: "asc" as const }, { month: "asc" as const }], select: { month: true, year: true } };
  const [invoice, month, expense, transaction] = await Promise.all([
    prisma.monthlyInvoice.findFirst(byPeriod),
    prisma.enrollmentMonth.findFirst(byPeriod),
    prisma.expense.findFirst(byPeriod),
    prisma.transaction.findFirst({ orderBy: { transferredAt: "asc" }, select: { transferredAt: true } })
  ]);
  const candidates: Period[] = [invoice, month, expense].filter((value): value is Period => Boolean(value));
  if (transaction) {
    candidates.push({ month: transaction.transferredAt.getMonth() + 1, year: transaction.transferredAt.getFullYear() });
  }
  const current = { month: now.getMonth() + 1, year: now.getFullYear() };
  const endIndex = periodIndex(current.month, current.year);
  const startIndex = Math.min(endIndex, ...candidates.map((period) => periodIndex(period.month, period.year)));
  const periods: Period[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    periods.push({ month: (index % 12) + 1, year: Math.floor(index / 12) });
  }
  return periods;
}

// ---------------------------------------------------------------------------
// Nội dung một tab tháng
// ---------------------------------------------------------------------------

const dateText = (value: Date | null | undefined) => (value ? value.toLocaleDateString("vi-VN") : "");
const sumOf = (rows: Cell[][], column: number) =>
  rows.reduce((total, row) => total + (typeof row[column] === "number" ? (row[column] as number) : 0), 0);

export async function buildMonthRows(month: number, year: number, now = new Date()): Promise<SheetRow[]> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);
  const hasPeriodData = [{ months: { some: { month, year } } }, { invoices: { some: { month, year } } }];
  // Tháng đã qua chỉ lưu học sinh có phát sinh (kế hoạch hoặc hóa đơn); tháng hiện tại lưu cả
  // học sinh đang học chưa nhập gì, giống danh sách lớp.
  const isPast = periodIndex(month, year) < periodIndex(now.getMonth() + 1, now.getFullYear());

  const [enrollments, transactions, expenses, finance] = await Promise.all([
    prisma.enrollment.findMany({
      where: isPast
        ? { OR: hasPeriodData }
        : { AND: [enrollmentVisibleInPeriodWhere(month, year), { OR: [{ classRoom: { archivedAt: null } }, ...hasPeriodData] }] },
      include: {
        student: true,
        classRoom: true,
        invoices: { where: { month, year }, take: 1 },
        months: latestMonthUpToPeriodArgs(month, year)
      }
    }),
    prisma.transaction.findMany({
      where: { transferredAt: { gte: periodStart, lt: periodEnd } },
      orderBy: [{ transferredAt: "asc" }, { id: "asc" }],
      include: { matchedInvoice: { include: { enrollment: { include: { student: true, classRoom: true } } } } }
    }),
    prisma.expense.findMany({
      where: { month, year },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { classRoom: { select: { name: true } } }
    }),
    getMonthlyFinance(month, year)
  ]);

  // Học phí & số buổi
  let notInvoiced = 0;
  let voided = 0;
  const tuition = enrollments
    .map((enrollment) => {
      const invoice = enrollment.invoices[0];
      const latestMonth = enrollment.months[0];
      const plan = resolveMonthPlan({ month, year, latestMonth, invoice, enrollment, classRoom: enrollment.classRoom });
      const amount = invoice ? invoice.amount : plan.status === "active" ? plan.sessions * plan.pricePerSession : 0;
      if (!invoice) notInvoiced += amount;
      else if (invoice.status === "void") voided += invoice.amount;
      const className = invoice?.classNameSnapshot ?? enrollment.classRoom.name;
      const studentName = invoice?.studentNameSnapshot ?? enrollment.student.fullName;
      const cells: Cell[] = [
        className,
        invoice?.classShortCodeSnapshot ?? enrollment.classRoom.shortCode,
        (invoice?.teacherNameSnapshot ?? enrollment.classRoom.teacherName) || "",
        studentName,
        invoice?.studentPhoneSnapshot ?? enrollment.student.phone,
        plan.status === "on_leave" ? "Bảo lưu" : "Đang học",
        plan.status === "on_leave" ? 0 : plan.sessions,
        plan.pricePerSession,
        amount,
        invoice ? INVOICE_STATUS_LABEL[invoice.status] : "Chưa tạo",
        invoice?.status === "paid" ? invoice.paidAmount ?? invoice.amount : null,
        dateText(invoice?.paidAt),
        invoice?.statusReason ?? "",
        latestMonth && latestMonth.month === month && latestMonth.year === year ? latestMonth.note ?? "" : ""
      ];
      return { className, studentName, cells };
    })
    .sort((a, b) => collator.compare(a.className, b.className) || collator.compare(a.studentName, b.studentName))
    .map((row) => row.cells);

  const transactionRows: Cell[][] = transactions.map((transaction) => {
    const { status, matched, reason } = describeTransaction(transaction);
    return [
      transaction.transferredAt.toLocaleString("vi-VN"),
      transaction.gatewayRef,
      transaction.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản",
      transaction.amount,
      status,
      matched,
      reason,
      transaction.rawContent
    ];
  });

  const salaryRows: Cell[][] = finance.salaryLines
    .filter((line) => line.grossDue !== 0 || line.paidOut !== 0 || line.debt !== 0 || line.waiting.length > 0)
    .sort((a, b) => collator.compare(a.teacherName, b.teacherName) || collator.compare(a.className, b.className))
    .map((line) => [
      line.teacherName || "Chưa ghi tên GV",
      `${line.className}${line.archived ? " (đã lưu trữ)" : ""}`,
      line.shortCode,
      line.mode === "percent" ? `${line.sharePercent}%` : "nhập tay",
      line.ownCollected,
      line.carriedInShare,
      line.grossDue,
      line.paidBank,
      line.paidCash,
      line.debt,
      line.difference,
      line.status.label,
      salaryLineNotes(line)
        .map((note) => `${note.label}: ${note.text}`)
        .join(" | ")
    ]);

  const expenseRows: Cell[][] = expenses.map((expense) => [
    expenseCategoryLabel(expense.category),
    expense.classRoom?.name ?? "",
    expense.description,
    expense.amount,
    dateText(expense.paidAt ?? expense.createdAt),
    expense.paymentMethod === "cash" ? "Tiền mặt" : expense.paymentMethod === "bank_transfer" ? "Chuyển khoản" : "",
    expense.note ?? ""
  ]);

  const summary: Array<[string, number]> = [
    ["Số học sinh (lượt theo lớp)", tuition.length],
    ["Tổng số buổi", sumOf(tuition, 6)],
    ["Đã phát hành có thể thu", finance.collected + finance.collectedShortfall + finance.outstanding],
    ["Đã thu (thực thu)", finance.collected],
    ["Còn nợ", finance.outstanding],
    ["Đã miễn", finance.waived],
    ["Hóa đơn đã hủy", voided],
    ["Dự kiến, chưa tạo hóa đơn", notInvoiced],
    ["Tiền về trong tháng", finance.cashIn.total],
    ["  · Chuyển khoản", finance.cashIn.bankTransfer],
    ["  · Tiền mặt", finance.cashIn.cash],
    ["Lương GV phải trả", finance.teacherCost],
    ["Lương GV đã chuyển", finance.teacherSettled],
    ["Chi phí khác", finance.otherCost],
    ["Lợi nhuận", finance.profit]
  ];
  const countRows = new Set([0, 1]);

  return [
    { cells: [`DỮ LIỆU ${formatMonth(month, year).toUpperCase()}`], style: "title" },
    {
      cells: [`Đồng bộ tự động từ hệ thống lúc ${now.toLocaleString("vi-VN")}. Không sửa trực tiếp: lần đồng bộ sau sẽ ghi đè.`],
      style: "note"
    },
    { cells: [] },
    { cells: ["TỔNG HỢP"], style: "section" },
    ...summary.map(([label, value], index): SheetRow => ({ cells: [label, value], money: countRows.has(index) ? [] : [1] })),
    { cells: [] },
    ...sheetSection({
      title: "HỌC PHÍ & SỐ BUỔI",
      headers: ["Lớp", "Mã lớp", "Giáo viên", "Học sinh", "SĐT", "Tình trạng", "Số buổi", "Đơn giá", "Thành tiền", "Hóa đơn", "Thực thu", "Ngày đóng", "Lý do", "Ghi chú"],
      rows: tuition,
      money: [7, 8, 10],
      totals: ["Cộng", null, null, null, null, null, sumOf(tuition, 6), null, sumOf(tuition, 8), null, sumOf(tuition, 10)],
      empty: "Không có học sinh trong tháng."
    }),
    ...sheetSection({
      title: "GIAO DỊCH",
      headers: ["Thời gian", "Mã giao dịch", "Phương thức", "Số tiền", "Trạng thái", "Hóa đơn khớp", "Lý do / ghi chú", "Nội dung"],
      rows: transactionRows,
      money: [3],
      totals: ["Cộng", null, null, sumOf(transactionRows, 3)],
      empty: "Không có giao dịch trong tháng."
    }),
    ...sheetSection({
      title: "LƯƠNG GIÁO VIÊN",
      headers: ["Giáo viên", "Lớp", "Mã lớp", "% lương", "Học phí tính lương", "Nộp muộn tháng trước", "Tổng tháng", "Chuyển khoản", "Tiền mặt", "Dư nợ", "Còn phải trả", "Tình trạng", "Ghi chú"],
      rows: salaryRows,
      money: [4, 5, 6, 7, 8, 9, 10],
      totals: ["Cộng", null, null, null, ...[4, 5, 6, 7, 8, 9, 10].map((column) => sumOf(salaryRows, column))],
      empty: "Không có lương phát sinh."
    }),
    ...sheetSection({
      title: "CHI PHÍ",
      headers: ["Loại", "Lớp", "Mô tả", "Số tiền", "Ngày chi", "Hình thức", "Ghi chú"],
      rows: expenseRows,
      money: [3],
      totals: ["Cộng", null, null, sumOf(expenseRows, 3)],
      empty: "Không có chi phí."
    })
  ];
}

// ---------------------------------------------------------------------------
// Chạy đồng bộ
// ---------------------------------------------------------------------------

let running: Promise<{ months: number; title: string }> | null = null;

export function isSheetSyncRunning() {
  return running !== null;
}

/**
 * `recent`: tháng hiện tại, tháng trước và các tháng vừa có dữ liệu sửa. `all`: toàn bộ lịch sử
 * (dùng lần đầu). Mỗi tháng một batchUpdate, nằm dưới hạn mức 60 lần ghi/phút của Google.
 */
export async function runSheetSync(trigger: SheetSyncTrigger, scope: "recent" | "all") {
  if (running) throw new Error("Đang có một lượt đồng bộ chạy, vui lòng đợi xong rồi thử lại.");
  running = (async () => {
    const startedAt = new Date();
    const config = await getSheetSyncConfig();
    try {
      if (!config.configured) throw new Error("Chưa cấu hình Google Sheet.");
      const account = parseServiceAccount(config.serviceAccountJson);
      const since = config.status?.lastSuccessAt ? new Date(config.status.lastSuccessAt) : null;
      const periods = scope === "all" ? await allPeriods(startedAt) : await recentPeriods(startedAt, since);

      const spreadsheet = await listSheetTabs(account, config.spreadsheetId);
      const tabs = new Map(spreadsheet.tabs.map((tab) => [tab.title, tab.sheetId]));
      const usedIds = new Set(spreadsheet.tabs.map((tab) => tab.sheetId));
      for (const { month, year } of periods) {
        const title = monthTabTitle(month, year);
        const existingId = tabs.get(title);
        const sheetId = existingId ?? pickSheetId(month, year, usedIds);
        usedIds.add(sheetId);
        tabs.set(title, sheetId);
        const rows = await buildMonthRows(month, year, startedAt);
        await batchUpdateSpreadsheet(
          account,
          config.spreadsheetId,
          buildTabRequests({ sheetId, title, rows, create: existingId === undefined })
        );
      }

      await saveStatus({
        at: new Date().toISOString(),
        ok: true,
        message: `Đã đồng bộ ${periods.length} tháng (${periods.map((period) => monthTabTitle(period.month, period.year)).join(", ")}).`,
        trigger,
        lastSuccessAt: startedAt.toISOString(),
        nightlyDate: trigger === "nightly" ? localDateKey(startedAt) : config.status?.nightlyDate ?? null
      });
      return { months: periods.length, title: spreadsheet.title };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không đồng bộ được Google Sheet.";
      await saveStatus({
        at: new Date().toISOString(),
        ok: false,
        message,
        trigger,
        lastSuccessAt: config.status?.lastSuccessAt ?? null,
        nightlyDate: config.status?.nightlyDate ?? null
      }).catch(() => undefined);
      throw new Error(message);
    }
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

/** Lượt tự động hằng đêm: đã qua giờ chạy, đã cấu hình và hôm nay chưa chạy xong. */
export async function isNightlySyncDue(now = new Date()) {
  if (now.getHours() < NIGHTLY_SYNC_HOUR) return false;
  const config = await getSheetSyncConfig();
  return config.configured && config.status?.nightlyDate !== localDateKey(now);
}
