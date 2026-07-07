import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { CENTER_INFO } from "@/lib/center";

const BRAND_COLOR = "FF4338CA";
const MUTED_COLOR = "FF57534E";
const HEADER_FILL = "FF4338CA";
const STRIPE_FILL = "FFF5F5F4";

let cachedLogo: Buffer | null | undefined;

function readLogoBuffer() {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    cachedLogo = fs.readFileSync(path.join(process.cwd(), CENTER_INFO.logoPath));
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

/**
 * Vẽ phần đầu báo cáo (logo, tên/SĐT/địa chỉ trung tâm, tiêu đề, phụ đề)
 * và trả về số dòng tiếp theo còn trống để bắt đầu bảng dữ liệu.
 */
export function addReportBranding(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  { title, subtitle, columnCount }: { title: string; subtitle: string; columnCount: number }
) {
  const lastCol = Math.max(columnCount, 4);
  sheet.properties.defaultRowHeight = 18;

  const logoBuffer = readLogoBuffer();
  if (logoBuffer) {
    // Type Buffer riêng của exceljs (extends ArrayBuffer) xung đột với Buffer của Node
    // trong bản khai báo type — cần ép kiểu để qua tsc.
    const imageId = workbook.addImage({ buffer: logoBuffer as unknown as ExcelJS.Buffer, extension: "jpeg" });
    sheet.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 56, height: 56 } });
  }
  sheet.mergeCells(1, 1, 3, 2);

  sheet.mergeCells(1, 3, 1, lastCol);
  const nameCell = sheet.getCell(1, 3);
  nameCell.value = CENTER_INFO.name;
  nameCell.font = { bold: true, size: 15, color: { argb: BRAND_COLOR } };

  sheet.mergeCells(2, 3, 2, lastCol);
  const contactCell = sheet.getCell(2, 3);
  contactCell.value = `SĐT: ${CENTER_INFO.phone}   ·   Địa chỉ: ${CENTER_INFO.address}`;
  contactCell.font = { size: 10, color: { argb: MUTED_COLOR } };

  sheet.mergeCells(3, 3, 3, lastCol);
  const emailCell = sheet.getCell(3, 3);
  emailCell.value = CENTER_INFO.email;
  emailCell.font = { size: 10, italic: true, color: { argb: MUTED_COLOR } };

  sheet.mergeCells(4, 1, 4, lastCol);
  sheet.getRow(4).height = 6;

  sheet.mergeCells(5, 1, 5, lastCol);
  const titleCell = sheet.getCell(5, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 14, color: { argb: "FF1C1917" } };
  titleCell.alignment = { horizontal: "center" };
  sheet.getRow(5).height = 22;

  sheet.mergeCells(6, 1, 6, lastCol);
  const subtitleCell = sheet.getCell(6, 1);
  subtitleCell.value = subtitle;
  subtitleCell.alignment = { horizontal: "center" };
  subtitleCell.font = { italic: true, size: 10, color: { argb: MUTED_COLOR } };

  sheet.mergeCells(7, 1, 7, lastCol);
  const generatedCell = sheet.getCell(7, 1);
  generatedCell.value = `Xuất lúc: ${new Date().toLocaleString("vi-VN")}`;
  generatedCell.alignment = { horizontal: "center" };
  generatedCell.font = { size: 9, color: { argb: MUTED_COLOR } };

  sheet.addRow([]);

  return 9; // dòng trống kế tiếp, sẵn sàng cho header bảng dữ liệu
}

/** Style dòng tiêu đề bảng dữ liệu (chữ trắng, nền brand color). */
export function styleTableHeaderRow(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FFE7E5E4" } },
      bottom: { style: "thin", color: { argb: "FFE7E5E4" } },
      left: { style: "thin", color: { argb: "FFE7E5E4" } },
      right: { style: "thin", color: { argb: "FFE7E5E4" } }
    };
  });
}

/** Kẻ viền + tô sọc xen kẽ cho các dòng dữ liệu, dễ đọc hơn khi in. */
export function styleTableDataRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, columnCount: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    const isStripe = (r - startRow) % 2 === 1;
    for (let c = 1; c <= columnCount; c++) {
      const cell = row.getCell(c);
      cell.border = {
        top: { style: "thin", color: { argb: "FFF0EFED" } },
        bottom: { style: "thin", color: { argb: "FFF0EFED" } },
        left: { style: "thin", color: { argb: "FFF0EFED" } },
        right: { style: "thin", color: { argb: "FFF0EFED" } }
      };
      if (isStripe) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE_FILL } };
      }
    }
  }
}
