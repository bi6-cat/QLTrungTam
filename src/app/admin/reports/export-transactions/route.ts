import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addReportBranding, styleTableDataRows, styleTableHeaderRow } from "@/lib/excel-report";
import { formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const rawMonth = url.searchParams.get("month");
  const rawYear = url.searchParams.get("year");
  const month = rawMonth === null || rawMonth.trim() === "" ? now.getMonth() + 1 : Number(rawMonth);
  const year = rawYear === null || rawYear.trim() === "" ? now.getFullYear() : Number(rawYear);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    return NextResponse.json(
      { error: "Tháng phải từ 1-12 và năm phải từ 2000-2100." },
      { status: 400 }
    );
  }

  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);

  const transactions = await prisma.transaction.findMany({
    where: { transferredAt: { gte: periodStart, lt: periodEnd } },
    orderBy: { transferredAt: "desc" },
    include: {
      matchedInvoice: {
        include: { enrollment: { include: { student: true, classRoom: true } } }
      }
    }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`GD-T${month}-${year}`);
  const columns = [
    { key: "time", width: 20 },
    { key: "gatewayRef", width: 22 },
    { key: "paymentMethod", width: 16 },
    { key: "amount", width: 15 },
    { key: "status", width: 15 },
    { key: "matched", width: 36 },
    { key: "reason", width: 36 },
    { key: "content", width: 42 }
  ];
  sheet.columns = columns;

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "LỊCH SỬ GIAO DỊCH",
    subtitle: formatMonth(month, year),
    columnCount: columns.length
  });

  const headerRow = sheet.getRow(headerStartRow);
  headerRow.values = [
    "Thời gian",
    "Mã giao dịch",
    "Phương thức",
    "Số tiền",
    "Trạng thái",
    "Hóa đơn khớp",
    "Lý do / ghi chú",
    "Nội dung"
  ];
  styleTableHeaderRow(headerRow);

  const firstDataRow = headerStartRow + 1;
  for (const transaction of transactions) {
    const status = transaction.reversedAt
      ? "Đã hoàn tác"
      : transaction.matchedInvoiceId
        ? "Đã khớp"
        : transaction.resolvedAt
          ? "Đã xử lý"
          : "Chưa khớp";
    const matched = transaction.reversedAt
      ? "Liên kết đã được hoàn tác"
      : transaction.matchedInvoice
        ? `${transaction.matchedInvoice.classShortCodeSnapshot ?? transaction.matchedInvoice.enrollment.classRoom.shortCode} · ${transaction.matchedInvoice.studentNameSnapshot ?? transaction.matchedInvoice.enrollment.student.fullName} · ${formatMonth(transaction.matchedInvoice.month, transaction.matchedInvoice.year)}`
        : transaction.matchedInvoiceId
          ? "Liên kết hóa đơn không còn khả dụng"
          : transaction.resolvedAt
            ? "Đã xử lý thủ công (không gán hóa đơn)"
            : "-";
    const reason = transaction.reversedAt
      ? transaction.reversalReason ?? transaction.resolvedNote
      : transaction.matchedInvoiceId
        ? transaction.matchOverrideReason ?? transaction.matchReason
        : transaction.resolvedAt
          ? transaction.resolvedNote
          : transaction.matchReason;

    sheet.addRow({
      time: transaction.transferredAt.toLocaleString("vi-VN"),
      gatewayRef: transaction.gatewayRef,
      paymentMethod: transaction.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản",
      amount: transaction.amount,
      status,
      matched,
      reason: reason ?? "-",
      content: transaction.rawContent
    });
  }
  const lastDataRow = firstDataRow + transactions.length - 1;
  if (transactions.length > 0) {
    styleTableDataRows(sheet, firstDataRow, lastDataRow, columns.length);
  }

  const validTransactions = transactions.filter((transaction) => !transaction.reversedAt);
  const validBank = validTransactions.filter(
    (transaction) => transaction.paymentMethod === "bank_transfer"
  );
  const validCash = validTransactions.filter((transaction) => transaction.paymentMethod === "cash");
  const matchedCount = validTransactions.filter((transaction) => transaction.matchedInvoiceId).length;
  const resolvedCount = validTransactions.filter(
    (transaction) => !transaction.matchedInvoiceId && transaction.resolvedAt
  ).length;
  const openCount = validTransactions.filter(
    (transaction) => !transaction.matchedInvoiceId && !transaction.resolvedAt
  ).length;
  const reversedTransactions = transactions.filter((transaction) => transaction.reversedAt);
  const validBankAmount = validBank.reduce((sum, transaction) => sum + transaction.amount, 0);
  const validCashAmount = validCash.reduce((sum, transaction) => sum + transaction.amount, 0);

  sheet.addRow([]);
  const validTotalRow = sheet.addRow({
    time: "Tổng hợp lệ (không hoàn tác)",
    amount: validBankAmount + validCashAmount
  });
  const bankRow = sheet.addRow({
    time: "Chuyển khoản hợp lệ",
    gatewayRef: `${validBank.length} giao dịch`,
    amount: validBankAmount
  });
  const cashRow = sheet.addRow({
    time: "Tiền mặt hợp lệ",
    gatewayRef: `${validCash.length} giao dịch`,
    amount: validCashAmount
  });
  const countRow = sheet.addRow({
    time: "Số giao dịch theo trạng thái",
    gatewayRef: `${transactions.length} tổng`,
    paymentMethod: `${reversedTransactions.length} hoàn tác`,
    status: `${matchedCount} đã khớp`,
    matched: `${resolvedCount} đã xử lý`,
    reason: `${openCount} chưa khớp`
  });
  [validTotalRow, bankRow, cashRow, countRow].forEach((row) => {
    row.eachCell((cell) => {
      cell.font = { bold: true };
    });
  });

  sheet.getColumn("amount").numFmt = '#,##0 "₫"';
  sheet.views = [{ state: "frozen", ySplit: headerStartRow }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="lich-su-giao-dich-T${month}-${year}.xlsx"`
    }
  });
}
