import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { periodIndex } from "@/lib/enrollment-period";
import { addReportBranding, styleTableDataRows, styleTableHeaderRow } from "@/lib/excel-report";
import { formatDayMonth, formatMonth } from "@/lib/format";
import { loadSalaryLedger, salaryLineNotes, type SalaryLine } from "@/lib/salary";

const RANGES = [1, 3, 6, 12];
const NO_TEACHER = "__none";
const MONEY = '#,##0 "₫"';

type Column = { key: string; header: string; width: number; money?: boolean };

/** Dựng một bảng có tiêu đề trung tâm, header màu và dòng sọc; trả về số dòng đầu/cuối của dữ liệu. */
function addTableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  title: string,
  subtitle: string,
  columns: Column[],
  rows: Array<Record<string, ExcelJS.CellValue>>
) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  const headerRowNumber = addReportBranding(workbook, sheet, { title, subtitle, columnCount: columns.length });
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = columns.map((column) => column.header);
  styleTableHeaderRow(headerRow);
  for (const row of rows) sheet.addRow(row);
  const firstDataRow = headerRowNumber + 1;
  const lastDataRow = firstDataRow + rows.length - 1;
  if (rows.length > 0) styleTableDataRows(sheet, firstDataRow, lastDataRow, columns.length);
  for (const column of columns) {
    if (column.money) sheet.getColumn(column.key).numFmt = MONEY;
  }
  sheet.views = [{ state: "frozen", ySplit: headerRowNumber }];
  return { sheet, firstDataRow, lastDataRow };
}

function addTotalRow(sheet: ExcelJS.Worksheet, values: Record<string, ExcelJS.CellValue>) {
  sheet.addRow({});
  const row = sheet.addRow(values);
  row.font = { bold: true };
  return row;
}

const sum = (lines: SalaryLine[], pick: (line: SalaryLine) => number) =>
  lines.reduce((total, line) => total + pick(line), 0);

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
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Tháng phải từ 1-12 và năm phải từ 2000-2100." }, { status: 400 });
  }
  const range = RANGES.find((value) => String(value) === url.searchParams.get("range")) ?? 1;
  const teacher = url.searchParams.get("teacher") ?? "";

  const toIndex = periodIndex(month, year);
  const fromIndex = toIndex - (range - 1);
  const fromMonth = (fromIndex % 12) + 1;
  const fromYear = Math.floor(fromIndex / 12);

  const ledger = (await loadSalaryLedger({ fromIndex, toIndex, now })).filter(
    (item) => !teacher || (item.teacherName || NO_TEACHER) === teacher
  );

  const periodLabel =
    range === 1 ? formatMonth(month, year) : `${formatMonth(fromMonth, fromYear)} – ${formatMonth(month, year)}`;
  const teacherLabel = !teacher ? "Tất cả giáo viên" : teacher === NO_TEACHER ? "Chưa ghi tên giáo viên" : teacher;
  const subtitle = `${periodLabel} · ${teacherLabel}`;
  const teacherName = (name: string) => name || "Chưa ghi tên GV";
  const workbook = new ExcelJS.Workbook();

  // 1. Chi tiết: mỗi giáo viên → lớp → tháng lương, cùng các cột như trang Lương GV.
  const lines = ledger.flatMap((item) => item.classes.flatMap((classRoom) => classRoom.periods));
  const detail = addTableSheet(
    workbook,
    "Lương GV",
    "BẢNG LƯƠNG GIÁO VIÊN",
    subtitle,
    [
      { key: "teacher", header: "Giáo viên", width: 20 },
      { key: "className", header: "Lớp", width: 24 },
      { key: "shortCode", header: "Mã lớp", width: 10 },
      { key: "period", header: "Tháng lương", width: 12 },
      { key: "cutoff", header: "Ngày chốt", width: 10 },
      { key: "percent", header: "% lương", width: 9 },
      { key: "collected", header: "Học phí tính lương", width: 17, money: true },
      { key: "carriedIn", header: "Nộp muộn tháng trước", width: 17, money: true },
      { key: "grossDue", header: "Tổng tháng", width: 15, money: true },
      { key: "bank", header: "Chuyển khoản", width: 15, money: true },
      { key: "cash", header: "Tiền mặt", width: 15, money: true },
      { key: "debt", header: "Dư nợ", width: 14, money: true },
      { key: "remaining", header: "Còn phải trả", width: 15, money: true },
      { key: "status", header: "Tình trạng", width: 20 },
      { key: "notes", header: "Ghi chú", width: 60 }
    ],
    lines.map((line) => ({
      teacher: teacherName(line.teacherName),
      className: `${line.className}${line.archived ? " (đã lưu trữ)" : ""}`,
      shortCode: line.shortCode,
      period: `T${line.month}/${line.year}`,
      cutoff: formatDayMonth(line.cutoffDate),
      percent: line.mode === "percent" ? `${line.sharePercent}%` : "nhập tay",
      collected: line.ownCollected,
      carriedIn: line.carriedInShare || null,
      grossDue: line.grossDue,
      bank: line.paidBank || null,
      cash: line.paidCash || null,
      debt: line.debt || null,
      remaining: line.difference || null,
      status: line.status.label,
      notes: salaryLineNotes(line)
        .map((note) => `${note.label}: ${note.text}`)
        .join("\n")
    }))
  );
  lines.forEach((line, offset) => {
    const row = detail.sheet.getRow(detail.firstDataRow + offset);
    row.getCell("notes").alignment = { wrapText: true, vertical: "top" };
    // Dư nợ đã bỏ qua thì gạch ngang như trên trang, để không cộng nhầm.
    if (line.writeOff) row.getCell("debt").font = { strike: true, color: { argb: "FFA8A29E" } };
  });
  addTotalRow(detail.sheet, {
    teacher: "Cộng",
    collected: sum(lines, (line) => line.ownCollected),
    carriedIn: sum(lines, (line) => line.carriedInShare),
    grossDue: sum(lines, (line) => line.grossDue),
    bank: sum(lines, (line) => line.paidBank),
    cash: sum(lines, (line) => line.paidCash),
    remaining: sum(lines, (line) => Math.max(0, line.difference)),
    notes: "Còn phải trả ở dòng Cộng chỉ tính các tháng chưa trả đủ (không trừ tháng trả dư)."
  });

  // 2. Tổng theo giáo viên: số cần chuyển và đã chuyển, để đối chiếu nhanh.
  const teacherRows = ledger.map((item) => {
    const teacherLines = item.classes.flatMap((classRoom) => classRoom.periods);
    return {
      teacher: teacherName(item.teacherName),
      classes: item.classes.length,
      grossDue: sum(teacherLines, (line) => line.grossDue),
      bank: sum(teacherLines, (line) => line.paidBank),
      cash: sum(teacherLines, (line) => line.paidCash),
      paid: sum(teacherLines, (line) => line.paidBank + line.paidCash),
      owed: sum(teacherLines, (line) => Math.max(0, line.difference)),
      over: sum(teacherLines, (line) => Math.max(0, -line.difference)),
      waiting: item.waitingShare
    };
  });
  const summary = addTableSheet(
    workbook,
    "Theo giáo viên",
    "TỔNG LƯƠNG THEO GIÁO VIÊN",
    subtitle,
    [
      { key: "teacher", header: "Giáo viên", width: 22 },
      { key: "classes", header: "Số lớp", width: 9 },
      { key: "grossDue", header: "Tổng tháng", width: 16, money: true },
      { key: "bank", header: "Chuyển khoản", width: 16, money: true },
      { key: "cash", header: "Tiền mặt", width: 16, money: true },
      { key: "paid", header: "Đã trả", width: 16, money: true },
      { key: "owed", header: "Còn thiếu", width: 16, money: true },
      { key: "over", header: "Trả dư", width: 14, money: true },
      { key: "waiting", header: "Chờ HS nộp", width: 14, money: true }
    ],
    teacherRows
  );
  addTotalRow(summary.sheet, {
    teacher: "Cộng",
    classes: teacherRows.reduce((total, row) => total + row.classes, 0),
    grossDue: teacherRows.reduce((total, row) => total + row.grossDue, 0),
    bank: teacherRows.reduce((total, row) => total + row.bank, 0),
    cash: teacherRows.reduce((total, row) => total + row.cash, 0),
    paid: teacherRows.reduce((total, row) => total + row.paid, 0),
    owed: teacherRows.reduce((total, row) => total + row.owed, 0),
    over: teacherRows.reduce((total, row) => total + row.over, 0),
    waiting: teacherRows.reduce((total, row) => total + row.waiting, 0)
  });

  // 3. Từng lần trả lương, theo ngày, để đối chiếu sao kê ngân hàng.
  const payouts = lines
    .flatMap((line) => line.payouts.map((payout) => ({ line, payout })))
    .sort(
      (a, b) =>
        (a.payout.paidAt ?? a.payout.createdAt).getTime() - (b.payout.paidAt ?? b.payout.createdAt).getTime()
    );
  const payoutSheet = addTableSheet(
    workbook,
    "Các lần trả",
    "CÁC LẦN TRẢ LƯƠNG",
    subtitle,
    [
      { key: "paidAt", header: "Ngày trả", width: 12 },
      { key: "teacher", header: "Giáo viên", width: 20 },
      { key: "className", header: "Lớp", width: 24 },
      { key: "period", header: "Tháng lương", width: 12 },
      { key: "method", header: "Hình thức", width: 14 },
      { key: "amount", header: "Số tiền", width: 16, money: true },
      { key: "note", header: "Ghi chú", width: 40 }
    ],
    payouts.map(({ line, payout }) => ({
      paidAt: (payout.paidAt ?? payout.createdAt).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }),
      teacher: teacherName(line.teacherName),
      className: line.className,
      period: `T${line.month}/${line.year}`,
      method: payout.paymentMethod === "cash" ? "Tiền mặt" : "Chuyển khoản",
      amount: payout.amount,
      note: payout.note ?? ""
    }))
  );
  addTotalRow(payoutSheet.sheet, {
    paidAt: "Cộng",
    amount: payouts.reduce((total, { payout }) => total + payout.amount, 0)
  });

  const fileRange = range === 1 ? `T${month}-${year}` : `T${fromMonth}-${fromYear}_T${month}-${year}`;
  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="luong-giao-vien-${fileRange}.xlsx"`
    }
  });
}
