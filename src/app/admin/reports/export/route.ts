import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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

  const invoices = await prisma.monthlyInvoice.findMany({
    where: {
      month,
      year,
      enrollment: classId ? { classId } : undefined
    },
    orderBy: [{ enrollment: { classRoom: { name: "asc" } } }, { enrollment: { student: { fullName: "asc" } } }],
    include: {
      enrollment: { include: { student: true, classRoom: true } }
    }
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`T${month}-${year}`);
  sheet.columns = [
    { header: "Lớp", key: "className", width: 22 },
    { header: "Mã lớp", key: "shortCode", width: 12 },
    { header: "Giáo viên", key: "teacherName", width: 20 },
    { header: "Học sinh", key: "student", width: 28 },
    { header: "SĐT", key: "phone", width: 16 },
    { header: "Tháng", key: "month", width: 10 },
    { header: "Số buổi", key: "sessions", width: 10 },
    { header: "Đơn giá", key: "pricePerSession", width: 14 },
    { header: "Thành tiền", key: "amount", width: 14 },
    { header: "Trạng thái", key: "status", width: 14 },
    { header: "Memo", key: "memo", width: 28 }
  ];

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

  sheet.addRow({});
  sheet.addRow({
    className: "Tổng dự kiến",
    amount: invoices.reduce((sum, invoice) => sum + invoice.amount, 0)
  });
  sheet.addRow({
    className: "Tổng đã thu",
    amount: invoices.filter((invoice) => invoice.status === "paid").reduce((sum, invoice) => sum + invoice.amount, 0)
  });

  sheet.getRow(1).font = { bold: true };
  sheet.getColumn("amount").numFmt = '#,##0 "VND"';
  sheet.getColumn("pricePerSession").numFmt = '#,##0 "VND"';

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-hoc-phi-T${month}-${year}.xlsx"`
    }
  });
}
