import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addReportBranding, styleTableDataRows, styleTableHeaderRow } from "@/lib/excel-report";
import { formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

const INVOICE_STATUS_LABEL = {
  paid: "Đã đóng",
  unpaid: "Chưa đóng",
  waived: "Đã miễn",
  void: "Đã hủy"
} as const;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const classId = url.searchParams.get("classId") || undefined;
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

  const [invoices, selectedClass] = await Promise.all([
    prisma.monthlyInvoice.findMany({
      where: {
        month,
        year,
        enrollment: classId ? { classId } : undefined
      },
      orderBy: [
        { classNameSnapshot: "asc" },
        { studentNameSnapshot: "asc" },
        { id: "asc" }
      ],
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
    { key: "statusReason", width: 28 },
    { key: "memo", width: 28 }
  ];
  sheet.columns = columns;

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "BÁO CÁO HỌC PHÍ",
    subtitle: `${formatMonth(month, year)}${selectedClass ? ` · Lớp ${invoices.find((invoice) => invoice.classNameSnapshot)?.classNameSnapshot ?? selectedClass.name}` : " · Tất cả các lớp"}`,
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
    "Lý do trạng thái",
    "Memo"
  ];
  styleTableHeaderRow(headerRow);

  const firstDataRow = headerStartRow + 1;
  for (const invoice of invoices) {
    sheet.addRow({
      className: invoice.classNameSnapshot ?? invoice.enrollment.classRoom.name,
      shortCode: invoice.classShortCodeSnapshot ?? invoice.enrollment.classRoom.shortCode,
      teacherName:
        (invoice.teacherNameSnapshot ?? invoice.enrollment.classRoom.teacherName) || "-",
      student: invoice.studentNameSnapshot ?? invoice.enrollment.student.fullName,
      phone: invoice.studentPhoneSnapshot ?? invoice.enrollment.student.phone,
      month: `${invoice.month}/${invoice.year}`,
      sessions: invoice.sessions,
      pricePerSession: invoice.pricePerSession,
      amount: invoice.amount,
      status: INVOICE_STATUS_LABEL[invoice.status],
      statusReason: invoice.statusReason ?? "-",
      memo: invoice.memoContent
    });
  }
  const lastDataRow = firstDataRow + invoices.length - 1;
  if (invoices.length > 0) {
    styleTableDataRows(sheet, firstDataRow, lastDataRow, columns.length);
  }

  const paidInvoices = invoices.filter((invoice) => invoice.status === "paid");
  const unpaidInvoices = invoices.filter((invoice) => invoice.status === "unpaid");
  const waivedInvoices = invoices.filter((invoice) => invoice.status === "waived");
  const voidInvoices = invoices.filter((invoice) => invoice.status === "void");
  const totalPaid = paidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalUnpaid = unpaidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalCollectible = totalPaid + totalUnpaid;
  const totalWaived = waivedInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalVoid = voidInvoices.reduce((sum, invoice) => sum + invoice.amount, 0);

  sheet.addRow([]);
  const collectibleRow = sheet.addRow({
    className: "Đã phát hành có thể thu",
    amount: totalCollectible
  });
  const paidRow = sheet.addRow({ className: "Tổng đã thu", amount: totalPaid });
  const remainingRow = sheet.addRow({ className: "Công nợ chưa thu", amount: totalUnpaid });
  const waivedRow = sheet.addRow({ className: "Đã miễn", amount: totalWaived });
  const voidRow = sheet.addRow({ className: "Đã hủy", amount: totalVoid });
  [collectibleRow, paidRow, remainingRow, waivedRow, voidRow].forEach((row) => {
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
