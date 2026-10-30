import assert from "node:assert/strict";
import { describe, test } from "node:test";
import ExcelJS from "exceljs";

import { parseCsv, readWordFile, rowsToWordText } from "../src/modules/learning/vocab/word-file";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("rowsToWordText", () => {
  test("drops the header row, empty rows and extra columns; keeps tabs between cells", () => {
    const text = rowsToWordText([
      ["Từ*", "Nghĩa*", "Từ loại", "Ví dụ"],
      ["apple", "quả táo", "n", "I eat an apple."],
      ["", "", "", ""],
      ["run", "chạy", "", ""],
      ["cat", "con mèo", "n", "", "cột thừa"]
    ]);
    assert.equal(text, "apple\tquả táo\tn\tI eat an apple.\nrun\tchạy\ncat\tcon mèo\tn");
  });

  test("keeps a first row that is a real word", () => {
    assert.equal(rowsToWordText([["word", "từ"], ["apple", "quả táo"]]), "apple\tquả táo");
    assert.equal(rowsToWordText([["dog", "con chó"]]), "dog\tcon chó");
  });
});

describe("parseCsv", () => {
  test("handles quotes, escaped quotes and commas inside cells", () => {
    assert.deepEqual(parseCsv('apple,"quả táo, trái táo"\n"say ""hi""",chào\r\n'), [
      ["apple", "quả táo, trái táo"],
      ['say "hi"', "chào"]
    ]);
  });

  test("detects semicolons (Excel with Vietnamese locale)", () => {
    assert.deepEqual(parseCsv("apple;quả táo;n\nrun;chạy, chạy bộ"), [
      ["apple", "quả táo", "n"],
      ["run", "chạy, chạy bộ"]
    ]);
  });
});

describe("readWordFile", () => {
  test("reads a Quizlet export (tab between term and definition)", async () => {
    const result = await readWordFile("quizlet.txt", bytes("apple\tquả táo\nrun\tchạy\n"));
    assert.deepEqual(result, { ok: true, text: "apple - quả táo\nrun - chạy", count: 2 });
  });

  test("reads a .txt already written as 'word - meaning' lines", async () => {
    const result = await readWordFile("list.txt", bytes("﻿apple (n) - quả táo | I eat an apple.\n"));
    assert.deepEqual(result, { ok: true, text: "apple (n) - quả táo | I eat an apple.", count: 1 });
  });

  test("reads CSV with a header row", async () => {
    const result = await readWordFile("list.csv", bytes("Từ,Nghĩa,Từ loại,Ví dụ\napple,quả táo,n,\nrun,\"chạy, chạy bộ\",v,I run every day.\n"));
    assert.deepEqual(result, { ok: true, text: "apple (n) - quả táo\nrun (v) - chạy, chạy bộ | I run every day.", count: 2 });
  });

  test("reads the first sheet of an Excel file", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Danh sách từ");
    sheet.addRow(["Từ*", "Nghĩa*", "Từ loại", "Ví dụ"]);
    sheet.addRow(["apple", "quả táo", "n", "I eat an apple."]);
    sheet.addRow(["colour / color", "màu sắc"]);
    const buffer = new Uint8Array(await workbook.xlsx.writeBuffer());
    const result = await readWordFile("Unit 3.XLSX", buffer);
    assert.deepEqual(result, { ok: true, text: "apple (n) - quả táo | I eat an apple.\ncolour / color - màu sắc", count: 2 });
  });

  test("keeps the raw columns when some lines have errors, so the preview points at them", async () => {
    const result = await readWordFile("list.csv", bytes("apple,quả táo\nbanana,\n"));
    assert.deepEqual(result, { ok: true, text: "apple\tquả táo\nbanana", count: 1 });
  });

  test("explains files it cannot read", async () => {
    const fail = async (name: string, data: Uint8Array) => {
      const result = await readWordFile(name, data);
      assert.equal(result.ok, false, name);
      return result.ok ? "" : result.error;
    };
    assert.match(await fail("old.xls", bytes("x")), /\.xlsx/);
    assert.match(await fail("list.docx", bytes("x")), /Chỉ nhận/);
    assert.match(await fail("empty.csv", new Uint8Array()), /trống/);
    assert.match(await fail("broken.xlsx", bytes("not a zip")), /Excel/);
    assert.match(await fail("ansi.csv", new Uint8Array([0x61, 0x2c, 0xe1, 0x0a])), /UTF-8/);
    assert.match(await fail("blank.csv", bytes("Từ,Nghĩa\n,\n")), /Không tìm thấy từ/);
    assert.match(await fail("big.csv", new Uint8Array(1_000_001)), /quá lớn/);
  });
});
