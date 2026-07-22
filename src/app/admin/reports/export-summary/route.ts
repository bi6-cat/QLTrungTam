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
  const transactionPeriodWhere = { transferredAt: { gte: periodStart, lt: periodEnd } };

  const [classes, validBank, validCash, matchedCount, resolvedCount, openCount, reversedCount] = await Promise.all([
    prisma.classRoom.findMany({
      where: {
        enrollments: {
          some: {
            OR: [
              { months: { some: { month, year } } },
              { invoices: { some: { month, year } } }
            ]
          }
        }
      },
      orderBy: { createdAt: "asc" },
      include: {
        enrollments: {
          where: {
            OR: [
              { months: { some: { month, year } } },
              { invoices: { some: { month, year } } }
            ]
          },
          include: {
            months: { where: { month, year }, take: 1 },
            invoices: { where: { month, year }, orderBy: { createdAt: "asc" } }
          }
        }
      }
    }),
    prisma.transaction.aggregate({
      where: { ...transactionPeriodWhere, paymentMethod: "bank_transfer", reversedAt: null },
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.transaction.aggregate({
      where: { ...transactionPeriodWhere, paymentMethod: "cash", reversedAt: null },
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.transaction.count({
      where: { ...transactionPeriodWhere, reversedAt: null, matchedInvoiceId: { not: null } }
    }),
    prisma.transaction.count({
      where: {
        ...transactionPeriodWhere,
        reversedAt: null,
        matchedInvoiceId: null,
        resolvedAt: { not: null }
      }
    }),
    prisma.transaction.count({
      where: { ...transactionPeriodWhere, reversedAt: null, matchedInvoiceId: null, resolvedAt: null }
    }),
    prisma.transaction.count({
      where: { ...transactionPeriodWhere, reversedAt: { not: null } }
    })
  ]);

  const classRows = classes
    .map((classRoom) => {
      const invoices = classRoom.enrollments.flatMap((enrollment) => enrollment.invoices);
      const paid = invoices.filter((invoice) => invoice.status === "paid");
      const unpaid = invoices.filter((invoice) => invoice.status === "unpaid");
      const waived = invoices.filter((invoice) => invoice.status === "waived");
      const voided = invoices.filter((invoice) => invoice.status === "void");
      const activeEnrollments = classRoom.enrollments.filter(
        (enrollment) => enrollment.months[0]?.status === "active"
      );
      const snapshotInvoice =
        invoices.find(
          (invoice) =>
            invoice.classNameSnapshot ||
            invoice.classShortCodeSnapshot ||
            invoice.teacherNameSnapshot
        ) ?? invoices[0];
      const paidAmount = paid.reduce((sum, invoice) => sum + invoice.amount, 0);
      const unpaidAmount = unpaid.reduce((sum, invoice) => sum + invoice.amount, 0);

      return {
        name: snapshotInvoice?.classNameSnapshot ?? classRoom.name,
        shortCode: snapshotInvoice?.classShortCodeSnapshot ?? classRoom.shortCode,
        teacherName: snapshotInvoice?.teacherNameSnapshot ?? classRoom.teacherName,
        activeStudents: activeEnrollments.length,
        unissuedCount: activeEnrollments.filter((enrollment) => enrollment.invoices.length === 0)
          .length,
        paidCount: paid.length,
        unpaidCount: unpaid.length,
        waivedCount: waived.length,
        voidCount: voided.length,
        plannedAmount: activeEnrollments.reduce((sum, enrollment) => {
          const period = enrollment.months[0];
          return period ? sum + period.sessions * period.pricePerSession : sum;
        }, 0),
        collectibleAmount: paidAmount + unpaidAmount,
        paidAmount,
        unpaidAmount,
        waivedAmount: waived.reduce((sum, invoice) => sum + invoice.amount, 0),
        voidAmount: voided.reduce((sum, invoice) => sum + invoice.amount, 0)
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));

  const totals = classRows.reduce(
    (acc, row) => ({
      activeStudents: acc.activeStudents + row.activeStudents,
      unissuedCount: acc.unissuedCount + row.unissuedCount,
      paidCount: acc.paidCount + row.paidCount,
      unpaidCount: acc.unpaidCount + row.unpaidCount,
      waivedCount: acc.waivedCount + row.waivedCount,
      voidCount: acc.voidCount + row.voidCount,
      plannedAmount: acc.plannedAmount + row.plannedAmount,
      collectibleAmount: acc.collectibleAmount + row.collectibleAmount,
      paidAmount: acc.paidAmount + row.paidAmount,
      unpaidAmount: acc.unpaidAmount + row.unpaidAmount,
      waivedAmount: acc.waivedAmount + row.waivedAmount,
      voidAmount: acc.voidAmount + row.voidAmount
    }),
    {
      activeStudents: 0,
      unissuedCount: 0,
      paidCount: 0,
      unpaidCount: 0,
      waivedCount: 0,
      voidCount: 0,
      plannedAmount: 0,
      collectibleAmount: 0,
      paidAmount: 0,
      unpaidAmount: 0,
      waivedAmount: 0,
      voidAmount: 0
    }
  );

  const validBankAmount = validBank._sum.amount ?? 0;
  const validCashAmount = validCash._sum.amount ?? 0;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`TQ-T${month}-${year}`);
  const columnCount = 13;
  sheet.getColumn(1).width = 24;
  sheet.getColumn(2).width = 12;
  sheet.getColumn(3).width = 20;
  for (let column = 4; column <= columnCount; column += 1) {
    sheet.getColumn(column).width = 15;
  }

  const headerStartRow = addReportBranding(workbook, sheet, {
    title: "BÁO CÁO TỔNG QUAN",
    subtitle: formatMonth(month, year),
    columnCount
  });

  const statLabelRow = sheet.getRow(headerStartRow);
  statLabelRow.getCell(1).value = "Chỉ tiêu";
  statLabelRow.getCell(2).value = "Giá trị";
  statLabelRow.getCell(4).value = "Chỉ tiêu";
  statLabelRow.getCell(5).value = "Giá trị";
  styleTableHeaderRow(statLabelRow);

  const stats: [string, string | number][] = [
    ["Kế hoạch theo kỳ", totals.plannedAmount],
    ["Đã phát hành có thể thu", totals.collectibleAmount],
    ["Đã thu hóa đơn", totals.paidAmount],
    ["Công nợ chưa thu", totals.unpaidAmount],
    ["HS đang học / chưa phát hành", `${totals.activeStudents} / ${totals.unissuedCount}`],
    [
      "Hóa đơn đóng / chưa / miễn / hủy",
      `${totals.paidCount} / ${totals.unpaidCount} / ${totals.waivedCount} / ${totals.voidCount}`
    ],
    [
      "Giá trị miễn / hủy",
      `${totals.waivedAmount.toLocaleString("vi-VN")}₫ / ${totals.voidAmount.toLocaleString("vi-VN")}₫`
    ],
    [
      "Chuyển khoản hợp lệ",
      `${validBank._count._all} · ${validBankAmount.toLocaleString("vi-VN")}₫`
    ],
    ["Tiền mặt hợp lệ", `${validCash._count._all} · ${validCashAmount.toLocaleString("vi-VN")}₫`],
    [
      "GD khớp / xử lý / chưa khớp / hoàn tác",
      `${matchedCount} / ${resolvedCount} / ${openCount} / ${reversedCount}`
    ]
  ];

  let rowNumber = headerStartRow + 1;
  for (let index = 0; index < stats.length; index += 2) {
    const row = sheet.getRow(rowNumber);
    row.getCell(1).value = stats[index][0];
    row.getCell(2).value = stats[index][1];
    if (typeof stats[index][1] === "number") row.getCell(2).numFmt = '#,##0 "₫"';
    if (stats[index + 1]) {
      row.getCell(4).value = stats[index + 1][0];
      row.getCell(5).value = stats[index + 1][1];
      if (typeof stats[index + 1][1] === "number") row.getCell(5).numFmt = '#,##0 "₫"';
    }
    row.getCell(1).font = { bold: true };
    row.getCell(4).font = { bold: true };
    rowNumber += 1;
  }
  styleTableDataRows(sheet, headerStartRow + 1, rowNumber - 1, columnCount);

  sheet.addRow([]);
  rowNumber += 1;

  const classHeaderRow = sheet.getRow(rowNumber + 1);
  classHeaderRow.values = [
    "Lớp",
    "Mã lớp",
    "Giáo viên",
    "HS đang học",
    "Chưa phát hành",
    "Đã đóng",
    "Chưa đóng",
    "Đã miễn",
    "Đã hủy",
    "Kế hoạch kỳ",
    "Có thể thu",
    "Đã thu",
    "Công nợ"
  ];
  styleTableHeaderRow(classHeaderRow);

  const classDataStart = rowNumber + 2;
  let cursor = classDataStart;
  for (const row of classRows) {
    sheet.getRow(cursor).values = [
      row.name,
      row.shortCode,
      row.teacherName || "-",
      row.activeStudents,
      row.unissuedCount,
      row.paidCount,
      row.unpaidCount,
      row.waivedCount,
      row.voidCount,
      row.plannedAmount,
      row.collectibleAmount,
      row.paidAmount,
      row.unpaidAmount
    ];
    cursor += 1;
  }
  if (classRows.length > 0) {
    styleTableDataRows(sheet, classDataStart, cursor - 1, columnCount);
  }
  for (let column = 10; column <= 13; column += 1) {
    sheet.getColumn(column).numFmt = '#,##0 "₫"';
  }
  sheet.views = [{ state: "frozen", ySplit: classHeaderRow.number }];

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="bao-cao-tong-quan-T${month}-${year}.xlsx"`
    }
  });
}
