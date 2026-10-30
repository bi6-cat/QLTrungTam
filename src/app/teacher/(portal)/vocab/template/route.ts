import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentTeacher } from "@/modules/identity";

export const runtime = "nodejs";

const SAMPLE = [
  ["apple", "quả táo", "n", "I eat an apple every day."],
  ["run", "chạy", "v", ""],
  ["colour / color", "màu sắc", "n", ""],
  ["well-known", "nổi tiếng", "adj", "She is a well-known singer."]
];

/** File Excel mẫu để giáo viên điền danh sách từ rồi tải lên. */
export async function GET() {
  const teacher = await getCurrentTeacher();
  if (!teacher?.vocabEnabled) return NextResponse.json({ error: "Không có quyền." }, { status: 403 });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Danh sách từ", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Từ*", key: "term", width: 24 },
    { header: "Nghĩa*", key: "meaning", width: 30 },
    { header: "Từ loại", key: "pos", width: 10 },
    { header: "Ví dụ", key: "example", width: 44 }
  ];
  const header = sheet.getRow(1);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  });
  SAMPLE.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="mau-danh-sach-tu.xlsx"',
      "Cache-Control": "no-store"
    }
  });
}
