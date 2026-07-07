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

  const [classes, transactions] = await Promise.all([
    prisma.classRoom.findMany({
      orderBy: { name: "asc" },
      include: {
        enrollments: {
          include: {
            student: true,
            invoices: { where: { month, year } }
          }
        }
      }
    }),
    prisma.transaction.findMany({ where: { transferredAt: { gte: periodStart, lt: periodEnd } } })
  ]);

  const classRows = classes.map((classRoom) => {
    const active = classRoom.enrollments.filter((item) => item.status === "active");
    const invoices = active.flatMap((item) => item.invoices);
    const paid = invoices.filter((item) => item.status === "paid");
    const expectedAmount = active.reduce((sum, enrollment) => {
      const invoice = enrollment.invoices[0];
      if (invoice) return sum + invoice.amount;
      const sessions = enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
      return sum + sessions * classRoom.pricePerSession;
    }, 0);
    const paidAmount = paid.reduce((sum, item) => sum + item.amount, 0);
    return {
      name: classRoom.name,
      shortCode: classRoom.shortCode,
      teacherName: classRoom.teacherName,
      activeStudents: active.length,
      invoiceCount: invoices.length,
      paidCount: paid.length,
      unpaidCount: invoices.length - paid.length,
      expectedAmount,
      paidAmount,
      remainingAmount: Math.max(0, expectedAmount - paidAmount)
    };
  });

  const totalExpected = classRows.reduce((sum, row) => sum + row.expectedAmount, 0);
  const totalPaid = classRows.reduce((sum, row) => sum + row.paidAmount, 0);
  const totalInvoices = classRows.reduce((sum, row) => sum + row.invoiceCount, 0);
  const totalPaidCount = classRows.reduce((sum, row) => sum + row.paidCount, 0);
  const matchedTx = transactions.filter((t) => t.matchedInvoiceId).length;
  const resolvedTx = transactions.filter((t) => !t.matchedInvoiceId && t.resolvedAt).length;
  const unmatchedTx = transactions.length - matchedTx - resolvedTx;
  const totalTxAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`TQ-T${month}-${year}`);
  const columnCount = 9;
  sheet.getColumn(1).width = 24;
  for (let c = 2; c <= columnCount; c++) sheet.getColumn(c).width = 14;

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "BÁO CÁO TỔNG QUAN",
    subtitle: formatMonth(month, year),
    columnCount
  });

  // Khối thống kê nhanh.
  const statLabelRow = sheet.getRow(headerStartRow);
  statLabelRow.getCell(1).value = "Chỉ tiêu";
  statLabelRow.getCell(2).value = "Giá trị";
  statLabelRow.getCell(4).value = "Chỉ tiêu";
  statLabelRow.getCell(5).value = "Giá trị";
  styleTableHeaderRow(sheet.getRow(headerStartRow));

  const stats: [string, string | number][] = [
    ["Tổng dự kiến thu", totalExpected],
    ["Đã thu", totalPaid],
    ["Còn phải thu", Math.max(0, totalExpected - totalPaid)],
    ["Tổng hóa đơn", totalInvoices],
    ["Đã đóng / Chưa đóng", `${totalPaidCount} / ${totalInvoices - totalPaidCount}`],
    ["Tổng giao dịch ngân hàng", `${transactions.length} · ${totalTxAmount.toLocaleString("vi-VN")}₫`],
    ["Đã khớp / Đã xử lý / Chưa khớp", `${matchedTx} / ${resolvedTx} / ${unmatchedTx}`]
  ];
  let r = headerStartRow + 1;
  for (let i = 0; i < stats.length; i += 2) {
    const row = sheet.getRow(r);
    row.getCell(1).value = stats[i][0];
    row.getCell(2).value = stats[i][1];
    if (stats[i + 1]) {
      row.getCell(4).value = stats[i + 1][0];
      row.getCell(5).value = stats[i + 1][1];
    }
    row.getCell(1).font = { bold: true };
    row.getCell(4).font = { bold: true };
    r += 1;
  }
  const statsEndRow = r;
  styleTableDataRows(sheet, headerStartRow + 1, statsEndRow - 1, columnCount);

  sheet.addRow([]);
  r += 1;

  // Bảng chi tiết theo lớp.
  const classHeaderRow = sheet.getRow(r + 1);
  classHeaderRow.values = [
    "Lớp",
    "Mã lớp",
    "Giáo viên",
    "HS đang học",
    "Hóa đơn",
    "Đã đóng",
    "Chưa đóng",
    "Đã thu",
    "Còn phải thu"
  ];
  styleTableHeaderRow(classHeaderRow);
  const classDataStart = r + 2;
  let cursor = classDataStart;
  for (const row of classRows) {
    sheet.getRow(cursor).values = [
      row.name,
      row.shortCode,
      row.teacherName || "-",
      row.activeStudents,
      row.invoiceCount,
      row.paidCount,
      row.unpaidCount,
      row.paidAmount,
      row.remainingAmount
    ];
    cursor += 1;
  }
  if (classRows.length > 0) {
    styleTableDataRows(sheet, classDataStart, cursor - 1, columnCount);
  }
  sheet.getColumn(8).numFmt = '#,##0 "₫"';
  sheet.getColumn(9).numFmt = '#,##0 "₫"';

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-tong-quan-T${month}-${year}.xlsx"`
    }
  });
}
