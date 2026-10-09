/**
 * Dựng nội dung một tab Google Sheet (mỗi tháng một tab) thành các request batchUpdate.
 * Mỗi lần đồng bộ ghi đè toàn bộ tab nên chạy lại bao nhiêu lần cũng không trùng dòng.
 */

export type Cell = string | number | null;
export type RowStyle = "title" | "note" | "section" | "header" | "total";
export type SheetRow = { cells: Cell[]; style?: RowStyle; money?: number[] };

export const MONEY_PATTERN = '#,##0" ₫"';
// Cột dùng chung cho mọi bảng trong tab: bảng Học phí rộng nhất (14 cột).
const COLUMN_WIDTHS = [190, 110, 150, 190, 120, 110, 110, 110, 120, 110, 120, 110, 180, 260];

export function monthTabTitle(month: number, year: number) {
  return `T${month}-${year}`;
}

/** Một bảng: dòng tiêu đề mục, dòng header, các dòng dữ liệu và (tùy chọn) dòng cộng. */
export function sheetSection(input: {
  title: string;
  headers: string[];
  rows: Cell[][];
  money?: number[];
  totals?: Cell[];
  empty?: string;
}): SheetRow[] {
  const money = input.money ?? [];
  const result: SheetRow[] = [
    { cells: [input.title], style: "section" },
    { cells: input.headers, style: "header" }
  ];
  if (input.rows.length === 0) {
    result.push({ cells: [input.empty ?? "Không có dữ liệu."], style: "note" });
  } else {
    for (const cells of input.rows) result.push({ cells, money });
    if (input.totals) result.push({ cells: input.totals, style: "total", money });
  }
  result.push({ cells: [] });
  return result;
}

const STYLE_FORMAT: Record<RowStyle, Record<string, unknown>> = {
  title: { textFormat: { bold: true, fontSize: 14 } },
  note: { textFormat: { italic: true, foregroundColor: { red: 0.47, green: 0.44, blue: 0.42 } } },
  section: {
    textFormat: { bold: true, fontSize: 11, foregroundColor: { red: 0.19, green: 0.18, blue: 0.51 } },
    backgroundColor: { red: 0.93, green: 0.94, blue: 1 }
  },
  header: { textFormat: { bold: true }, backgroundColor: { red: 0.95, green: 0.95, blue: 0.94 } },
  total: { textFormat: { bold: true } }
};

function cellData(value: Cell, style: RowStyle | undefined, money: boolean) {
  const format: Record<string, unknown> = { ...(style ? STYLE_FORMAT[style] : {}) };
  if (money && typeof value === "number") format.numberFormat = { type: "NUMBER", pattern: MONEY_PATTERN };
  // Dòng tiêu đề mục tô nền cả dòng cho dễ nhìn, kể cả ô trống.
  const data: Record<string, unknown> = Object.keys(format).length > 0 ? { userEnteredFormat: format } : {};
  if (typeof value === "number") data.userEnteredValue = { numberValue: value };
  else if (value !== null && value !== "") data.userEnteredValue = { stringValue: value };
  return data;
}

/**
 * Request ghi một tab: tạo tab (nếu chưa có) hoặc chỉnh kích thước, xóa sạch nội dung cũ rồi ghi
 * lại toàn bộ. Tất cả trong một batchUpdate nên Google áp dụng nguyên khối.
 */
export function buildTabRequests(input: {
  sheetId: number;
  title: string;
  rows: SheetRow[];
  create: boolean;
}) {
  const columnCount = Math.max(COLUMN_WIDTHS.length, ...input.rows.map((row) => row.cells.length));
  const rowCount = Math.max(50, input.rows.length + 20);
  const gridProperties = { rowCount, columnCount };
  const requests: unknown[] = [];

  if (input.create) {
    // Tab mới chèn lên đầu: đồng bộ theo thứ tự tháng tăng dần thì tháng mới nhất nằm đầu tiên.
    requests.push({ addSheet: { properties: { sheetId: input.sheetId, title: input.title, index: 0, gridProperties } } });
  } else {
    requests.push(
      { updateSheetProperties: { properties: { sheetId: input.sheetId, gridProperties }, fields: "gridProperties(rowCount,columnCount)" } },
      { unmergeCells: { range: { sheetId: input.sheetId } } },
      { updateCells: { range: { sheetId: input.sheetId }, fields: "userEnteredValue,userEnteredFormat" } }
    );
  }

  requests.push({
    updateCells: {
      start: { sheetId: input.sheetId, rowIndex: 0, columnIndex: 0 },
      fields: "userEnteredValue,userEnteredFormat",
      rows: input.rows.map((row) => {
        const width = row.style === "section" ? columnCount : row.cells.length;
        return {
          values: Array.from({ length: width }, (_, index) =>
            cellData(row.cells[index] ?? null, row.style, row.money?.includes(index) ?? false)
          )
        };
      })
    }
  });

  COLUMN_WIDTHS.forEach((pixelSize, index) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId: input.sheetId, dimension: "COLUMNS", startIndex: index, endIndex: index + 1 },
        properties: { pixelSize },
        fields: "pixelSize"
      }
    });
  });
  return requests;
}

/** sheetId cho tab mới: theo năm-tháng cho dễ nhận ra, tránh trùng với tab đã có. */
export function pickSheetId(month: number, year: number, usedIds: Set<number>) {
  let id = year * 100 + month;
  while (usedIds.has(id)) id += 1_000_000;
  return id;
}
