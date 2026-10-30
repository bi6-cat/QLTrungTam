import ExcelJS from "exceljs";
import { formatWordList, parseWordList } from "./word-list";

// Đọc file danh sách từ giáo viên tải lên (Excel, CSV, file xuất từ Quizlet) thành văn bản điền vào ô
// "Danh sách từ": giáo viên vẫn xem trước, sửa dòng lỗi rồi mới lưu như khi dán.

export const MAX_WORD_FILE_BYTES = 1_000_000;
export const WORD_FILE_ACCEPT = ".xlsx,.csv,.tsv,.txt";
const COLUMNS = 4; // từ, nghĩa, từ loại, câu ví dụ

const HEADER_WORDS = new Set(["tu", "tu vung", "tu tieng anh", "term", "word", "words", "english", "tieng anh", "vocabulary"]);

const plain = (value: string) =>
  value
    .replace(/đ/gi, "d")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\*/g, "")
    .trim()
    .toLowerCase();

/** Bảng ô → văn bản các cột cách nhau bằng tab (parseWordList đọc được); bỏ dòng tiêu đề và dòng trống. */
export function rowsToWordText(rows: readonly (readonly string[])[]) {
  const cleaned = rows
    .map((row) => row.slice(0, COLUMNS).map((cell) => cell.replace(/[\t\r\n]+/g, " ").trim()))
    .filter((row) => row.some(Boolean));
  if (cleaned.length > 0 && HEADER_WORDS.has(plain(cleaned[0][0] ?? ""))) cleaned.shift();
  return cleaned
    .map((row) => {
      const cells = [...row];
      while (cells.length > 0 && !cells.at(-1)) cells.pop();
      return cells.join("\t");
    })
    .join("\n");
}

/** CSV có ngoặc kép (RFC 4180). Dấu phân cách "," hoặc ";" (Excel tiếng Việt hay lưu ";"), tự nhận theo dòng đầu. */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const unquoted = firstLine.replace(/"[^"]*"/g, "");
  const delimiter = (unquoted.match(/;/g)?.length ?? 0) > (unquoted.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function decodeText(bytes: Uint8Array) {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  // Ký tự thay thế = file không phải UTF-8 (vd CSV lưu bằng Excel cũ theo bảng mã Windows).
  return text.includes("�") ? null : text;
}

async function readXlsx(bytes: Uint8Array) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    rows.push(Array.from({ length: COLUMNS }, (_, i) => row.getCell(i + 1).text ?? ""));
  });
  return rows;
}

export type WordFileResult = { ok: true; text: string; count: number } | { ok: false; error: string };

/**
 * File → văn bản cho ô danh sách từ. Đọc hết không lỗi thì trả bản đã chuẩn hoá ("apple (n) - quả
 * táo | ví dụ"); còn dòng lỗi thì trả nguyên các cột (cách tab) để phần xem trước chỉ đúng dòng.
 */
export async function readWordFile(fileName: string, bytes: Uint8Array): Promise<WordFileResult> {
  if (bytes.byteLength === 0) return { ok: false, error: "File trống." };
  if (bytes.byteLength > MAX_WORD_FILE_BYTES) return { ok: false, error: "File quá lớn (tối đa 1 MB). Hãy tách thành nhiều bộ." };
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  let text: string;
  if (ext === "xlsx") {
    try {
      text = rowsToWordText(await readXlsx(bytes));
    } catch {
      return { ok: false, error: "Không đọc được file Excel. Mở file bằng Excel, lưu lại dạng .xlsx rồi thử lại." };
    }
  } else if (ext === "xls") {
    return { ok: false, error: "File .xls đời cũ chưa đọc được. Mở bằng Excel rồi chọn Lưu thành (Save As) dạng .xlsx." };
  } else if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const decoded = decodeText(bytes);
    if (decoded === null) return { ok: false, error: "File không phải UTF-8. Khi lưu CSV trong Excel, chọn kiểu \"CSV UTF-8\"." };
    if (ext === "csv") text = rowsToWordText(parseCsv(decoded));
    else if (decoded.includes("\t")) text = rowsToWordText(decoded.split(/\r?\n/).map((line) => line.split("\t")));
    // .txt không có tab: viết sẵn dạng "apple - quả táo" như khi dán.
    else text = decoded;
  } else {
    return { ok: false, error: "Chỉ nhận file Excel (.xlsx), CSV hoặc file chữ (.txt) xuất từ Quizlet." };
  }

  const { words, errors } = parseWordList(text);
  if (words.length === 0 && errors.length === 0) return { ok: false, error: "Không tìm thấy từ nào trong file." };
  return { ok: true, text: errors.length === 0 ? formatWordList(words) : text, count: words.length };
}
