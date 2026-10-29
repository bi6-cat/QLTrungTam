import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getAuthorizedUser } from "@/lib/auth";
import { addReportBranding, styleTableDataRows, styleTableHeaderRow } from "@/lib/excel-report";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { issueStudentAccountsSchema } from "@/lib/validation";
import { listCurrentStudentsInClass } from "@/modules/center";
import { issueStudentAccounts } from "@/modules/identity";

export const runtime = "nodejs";

/**
 * Cấp tài khoản học sinh cho một lớp và trả phiếu Excel (mã + PIN) để in phát. PIN chỉ có trong
 * file này: DB giữ bản băm, muốn in lại thì phải cấp PIN mới.
 */
export async function POST(request: Request) {
  const session = await getAuthorizedUser(["owner"]);
  if (!session) return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const parsed = issueStudentAccountsSchema.safeParse({ classId: form?.get("classId"), mode: form?.get("mode") });
  if (!parsed.success) return NextResponse.json({ error: "Dữ liệu không hợp lệ." }, { status: 400 });

  const classRoom = await prisma.classRoom.findFirst({
    where: { id: parsed.data.classId, archivedAt: null },
    select: { id: true, name: true, shortCode: true }
  });
  if (!classRoom) return NextResponse.json({ error: "Không tìm thấy lớp." }, { status: 404 });

  const students = await listCurrentStudentsInClass(classRoom.id);
  const issued = await issueStudentAccounts(
    students.map((s) => s.id),
    parsed.data.mode
  );
  if (issued.length === 0) {
    return NextResponse.json({ error: "Mọi học sinh của lớp đều đã có tài khoản." }, { status: 409 });
  }

  await prisma.auditLog.create({
    data: {
      actorUserId: session.userId,
      actorUsername: session.username.trim(),
      action: parsed.data.mode === "all" ? "student_account.class_reissued" : "student_account.class_issued",
      entityType: "ClassRoom",
      entityId: classRoom.id,
      metadata: { studentIds: issued.map((i) => i.studentId) }
    }
  });

  const names = new Map(students.map((s) => [s.id, s.fullName]));
  const loginUrl = `${(await getAppSettings()).appUrl.replace(/\/+$/, "")}/login?as=student`;
  const issuedOn = new Date().toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tài khoản");
  const columns = [
    { key: "no", header: "STT", width: 6 },
    { key: "name", header: "Họ tên", width: 30 },
    { key: "code", header: "Mã học sinh", width: 16 },
    { key: "pin", header: "Mã PIN", width: 12 }
  ];
  sheet.columns = columns.map(({ key, width }) => ({ key, width }));
  const headerRowNumber = addReportBranding(workbook, sheet, {
    title: `Tài khoản học tập · ${classRoom.name}`,
    subtitle: `Đăng nhập tại ${loginUrl} · Cấp ngày ${issuedOn} · Giữ kín mã PIN`,
    columnCount: columns.length
  });
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.values = columns.map((c) => c.header);
  styleTableHeaderRow(headerRow);
  issued
    .map((i) => ({ name: names.get(i.studentId) ?? "", code: i.code, pin: i.pin }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"))
    .forEach((row, index) => sheet.addRow({ no: index + 1, ...row }));
  styleTableDataRows(sheet, headerRowNumber + 1, headerRowNumber + issued.length, columns.length);
  // PIN là chuỗi (giữ số 0 đầu); mã và PIN dùng font đều nét để không đọc nhầm ký tự.
  for (let r = headerRowNumber + 1; r <= headerRowNumber + issued.length; r++) {
    for (const key of ["code", "pin"]) {
      const cell = sheet.getRow(r).getCell(key);
      cell.font = { ...cell.font, name: "Consolas", bold: true };
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="tai-khoan-${classRoom.shortCode}.xlsx"`,
      "Cache-Control": "no-store",
      "X-Issued-Count": String(issued.length)
    }
  });
}
