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
  const classId = url.searchParams.get("classId") || undefined;
  const month = Number(url.searchParams.get("month") || new Date().getMonth() + 1);
  const year = Number(url.searchParams.get("year") || new Date().getFullYear());

  const [invoices, selectedClass] = await Promise.all([
    prisma.monthlyInvoice.findMany({
      where: {
        month,
        year,
        enrollment: classId ? { classId } : undefined
      },
      orderBy: [{ enrollment: { classRoom: { name: "asc" } } }, { enrollment: { student: { fullName: "asc" } } }],
      include: {
        enrollment: { include: { student: true, classRoom: true } }
      }
    }),
    classId ? prisma.classRoom.findUnique({ where: { id: classId } }) : null
  ]);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`T${month}-${year}`);
  const columns = [
    { key: "className", width: 22 },
    { key: "shortCode", width: 12 },
    { key: "teacherName", width: 20 },
    { key: "student", width: 26 },
    { key: "phone", width: 15 },
    { key: "month", width: 10 },
    { key: "sessions", width: 10 },
    { key: "pricePerSession", width: 14 },
    { key: "amount", width: 14 },
    { key: "status", width: 13 },
    { key: "memo", width: 28 }
  ];
  sheet.columns = columns;

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "BÁO CÁO HỌC PHÍ",
    subtitle: `${formatMonth(month, year)}${selectedClass ? ` · Lớp ${selectedClass.name}` : " · Tất cả các lớp"}`,
    columnCount: columns.length
  });

  const headerRow = sheet.getRow(headerStartRow);
  headerRow.values = [
    "Lớp",
    "Mã lớp",
    "Giáo viên",
    "Học sinh",
    "SĐT",
    "Tháng",
    "Số buổi",
    "Đơn giá",
    "Thành tiền",
    "Trạng thái",
    "Memo"
  ];
  styleTableHeaderRow(headerRow);

  const firstDataRow = headerStartRow + 1;
  for (const invoice of invoices) {
    sheet.addRow({
      className: invoice.enrollment.classRoom.name,
      shortCode: invoice.enrollment.classRoom.shortCode,
      teacherName: invoice.enrollment.classRoom.teacherName,
      student: invoice.enrollment.student.fullName,
      phone: invoice.enrollment.student.phone,
      month: `${invoice.month}/${invoice.year}`,
      sessions: invoice.sessions,
      pricePerSession: invoice.pricePerSession,
      amount: invoice.amount,
      status: invoice.status === "paid" ? "Đã đóng" : "Chưa đóng",
      memo: invoice.memoContent
    });
  }
  const lastDataRow = firstDataRow + invoices.length - 1;
  if (invoices.length > 0) {
    styleTableDataRows(sheet, firstDataRow, lastDataRow, columns.length);
  }

  const totalExpected = invoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalPaid = invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.amount, 0);

  sheet.addRow([]);
  const expectedRow = sheet.addRow({ className: "Tổng dự kiến", amount: totalExpected });
  const paidRow = sheet.addRow({ className: "Tổng đã thu", amount: totalPaid });
  const remainingRow = sheet.addRow({ className: "Còn phải thu", amount: Math.max(0, totalExpected - totalPaid) });
  [expectedRow, paidRow, remainingRow].forEach((row) => {
    row.getCell("className").font = { bold: true };
    row.getCell("amount").font = { bold: true };
  });

  sheet.getColumn("amount").numFmt = '#,##0 "₫"';
  sheet.getColumn("pricePerSession").numFmt = '#,##0 "₫"';
  sheet.views = [{ state: "frozen", ySplit: headerStartRow }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-hoc-phi-T${month}-${year}.xlsx"`
    }
  });
}
