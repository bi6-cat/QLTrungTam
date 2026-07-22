import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const classes = await prisma.classRoom.findMany({
    where: { archivedAt: null },
    orderBy: [{ name: "asc" }, { shortCode: "asc" }],
    select: { shortCode: true, name: true, teacherName: true }
  });
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Quản lý trung tâm";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Học sinh", {
    views: [{ state: "frozen", ySplit: 1 }]
  });
  sheet.columns = [
    { header: "Họ và tên*", key: "fullName", width: 26 },
    { header: "Số điện thoại*", key: "phone", width: 18 },
    { header: "Tên phụ huynh", key: "parentName", width: 24 },
    { header: "Địa chỉ", key: "address", width: 34 },
    { header: "Mã lớp*", key: "classCodes", width: 24 },
    { header: "Số buổi riêng", key: "sessionsOverride", width: 16 },
    { header: "Trạng thái", key: "status", width: 16 },
    { header: "Ghi chú", key: "note", width: 32 }
  ];
  const header = sheet.getRow(1);
  header.height = 26;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  sheet.autoFilter = "A1:H1";
  for (let row = 2; row <= 501; row += 1) {
    sheet.getCell(row, 2).numFmt = "@";
    sheet.getCell(row, 6).dataValidation = {
      type: "whole",
      operator: "between",
      allowBlank: true,
      formulae: [0, 60],
      showErrorMessage: true,
      errorTitle: "Số buổi không hợp lệ",
      error: "Nhập số nguyên từ 0 đến 60 hoặc để trống."
    };
    sheet.getCell(row, 7).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Đang học,Bảo lưu"'],
      showErrorMessage: true,
      errorTitle: "Trạng thái không hợp lệ",
      error: "Chọn Đang học hoặc Bảo lưu."
    };
  }
  sheet.getCell("E1").note = "Có thể nhập nhiều mã lớp, ngăn cách bằng dấu phẩy. Ví dụ: TOAN6, VAN6";
  sheet.getCell("F1").note = "Để trống để dùng số buổi mặc định của lớp.";
  sheet.getCell("G1").note = "Để trống sẽ mặc định là Đang học.";

  const guide = workbook.addWorksheet("Hướng dẫn");
  guide.columns = [{ width: 28 }, { width: 90 }];
  guide.addRows([
    ["Mục", "Hướng dẫn"],
    ["Cột bắt buộc", "Họ và tên, Số điện thoại và Mã lớp."],
    ["Số điện thoại", "Nên giữ định dạng văn bản để không mất số 0 ở đầu."],
    ["Nhiều lớp", "Nhập các mã lớp trên cùng một dòng và ngăn cách bằng dấu phẩy."],
    ["Số buổi riêng", "Nhập số nguyên 0-60 hoặc để trống để dùng mặc định của lớp."],
    ["Trạng thái", "Nhập Đang học hoặc Bảo lưu; để trống mặc định Đang học."],
    ["Kiểm tra", "Hệ thống luôn cho xem trước, sửa lỗi và xác nhận cảnh báo trước khi lưu."],
    ["Giới hạn", "Tối đa 500 dòng và 5 MB cho mỗi lần nhập."]
  ]);
  guide.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  });
  guide.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });

  const classSheet = workbook.addWorksheet("Danh mục lớp");
  classSheet.columns = [
    { header: "Mã lớp", key: "shortCode", width: 18 },
    { header: "Tên lớp", key: "name", width: 32 },
    { header: "Giáo viên", key: "teacherName", width: 26 }
  ];
  for (const classRoom of classes) classSheet.addRow(classRoom);
  classSheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  });
  classSheet.views = [{ state: "frozen", ySplit: 1 }];
  classSheet.autoFilter = "A1:C1";

  const output = await workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(output), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-nhap-hoc-sinh.xlsx"',
      "Cache-Control": "private, no-store"
    }
  });
}
