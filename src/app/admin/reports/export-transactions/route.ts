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
  const month = Number(url.searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(url.searchParams.get("year") || new Date().getFullYear());
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
    { key: "amount", width: 15 },
    { key: "status", width: 14 },
    { key: "matched", width: 32 },
    { key: "content", width: 40 }
  ];
  sheet.columns = columns;

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "LỊCH SỬ GIAO DỊCH",
    subtitle: formatMonth(month, year),
    columnCount: columns.length
  });

  const headerRow = sheet.getRow(headerStartRow);
  headerRow.values = ["Thời gian", "Mã giao dịch", "Số tiền", "Trạng thái", "Hóa đơn khớp", "Nội dung"];
  styleTableHeaderRow(headerRow);

  const firstDataRow = headerStartRow + 1;
  for (const transaction of transactions) {
    const status = transaction.matchedInvoice ? "Đã khớp" : transaction.resolvedAt ? "Đã xử lý" : "Chưa khớp";
    const matched = transaction.matchedInvoice
      ? `${transaction.matchedInvoice.enrollment.classRoom.shortCode} · ${transaction.matchedInvoice.enrollment.student.fullName} · ${formatMonth(transaction.matchedInvoice.month, transaction.matchedInvoice.year)}`
      : transaction.resolvedAt
      ? "Đã xử lý thủ công (không gán học sinh)"
      : "-";
    sheet.addRow({
      time: transaction.transferredAt.toLocaleString("vi-VN"),
      gatewayRef: transaction.gatewayRef,
      amount: transaction.amount,
      status,
      matched,
      content: transaction.rawContent
    });
  }
  const lastDataRow = firstDataRow + transactions.length - 1;
  if (transactions.length > 0) {
    styleTableDataRows(sheet, firstDataRow, lastDataRow, columns.length);
  }

  const matchedCount = transactions.filter((t) => t.matchedInvoice).length;
  const resolvedCount = transactions.filter((t) => !t.matchedInvoice && t.resolvedAt).length;
  const unmatchedCount = transactions.length - matchedCount - resolvedCount;
  const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  sheet.addRow([]);
  const totalRow = sheet.addRow({ time: "Tổng số tiền giao dịch", amount: totalAmount });
  const countRow = sheet.addRow({
    time: "Số giao dịch",
    gatewayRef: `${transactions.length} tổng`,
    amount: null,
    status: `${matchedCount} đã khớp`,
    matched: `${resolvedCount} đã xử lý`,
    content: `${unmatchedCount} chưa khớp`
  });
  [totalRow, countRow].forEach((row) => {
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
