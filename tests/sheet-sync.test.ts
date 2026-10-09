import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { afterEach, describe, test } from "node:test";

import { extractSpreadsheetId, listSheetTabs, parseServiceAccount } from "../src/lib/google-sheets";
import { buildTabRequests, monthTabTitle, pickSheetId, sheetSection } from "../src/lib/sheet-layout";

const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("google sheets config", () => {
  test("extracts the id from a link or a bare id", () => {
    assert.equal(extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`), SHEET_ID);
    assert.equal(extractSpreadsheetId(` ${SHEET_ID} `), SHEET_ID);
    assert.equal(extractSpreadsheetId("https://example.com/abc"), null);
    assert.equal(extractSpreadsheetId(""), null);
  });

  test("rejects keys that are not a service account JSON", () => {
    assert.throws(() => parseServiceAccount("not json"), /JSON/);
    assert.throws(() => parseServiceAccount(JSON.stringify({ client_email: "a@b.c" })), /private_key/);
  });
});

describe("google sheets auth", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("signs the token request with the service account key", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const account = parseServiceAccount(
      JSON.stringify({
        client_email: "sync@test.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" })
      })
    );
    const calls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) {
        const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
        const [header, claims, signature] = assertion.split(".");
        const valid = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, signature, "base64url");
        assert.equal(valid, true);
        const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
        assert.equal(payload.iss, "sync@test.iam.gserviceaccount.com");
        assert.equal(payload.scope, "https://www.googleapis.com/auth/spreadsheets");
        return new Response(JSON.stringify({ access_token: "token-1", expires_in: 3600 }));
      }
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer token-1");
      return new Response(
        JSON.stringify({ properties: { title: "Lưu trữ" }, sheets: [{ properties: { sheetId: 0, title: "Sheet1", index: 0 } }] })
      );
    }) as typeof fetch;

    const result = await listSheetTabs(account, SHEET_ID);
    assert.equal(result.title, "Lưu trữ");
    assert.deepEqual(result.tabs, [{ sheetId: 0, title: "Sheet1", index: 0 }]);
    assert.equal(calls.length, 2);
  });
});

describe("sheet layout", () => {
  test("names one tab per month", () => {
    assert.equal(monthTabTitle(10, 2026), "T10-2026");
    assert.equal(pickSheetId(10, 2026, new Set()), 202610);
    assert.equal(pickSheetId(10, 2026, new Set([202610])), 1202610);
  });

  test("sections add header, rows, totals and a blank line", () => {
    const rows = sheetSection({ title: "GIAO DỊCH", headers: ["A", "Số tiền"], rows: [["x", 100]], money: [1], totals: ["Cộng", 100] });
    assert.deepEqual(
      rows.map((row) => row.style ?? "data"),
      ["section", "header", "data", "total", "data"]
    );
    const empty = sheetSection({ title: "CHI PHÍ", headers: ["A"], rows: [], empty: "Không có chi phí." });
    assert.deepEqual(empty[2], { cells: ["Không có chi phí."], style: "note" });
  });

  test("rewrites an existing tab instead of appending", () => {
    const requests = buildTabRequests({
      sheetId: 7,
      title: "T10-2026",
      rows: [{ cells: ["Tổng", 1500000], money: [1] }],
      create: false
    }) as Array<Record<string, any>>;
    assert.ok(!requests.some((request) => request.addSheet));
    const clear = requests.find((request) => request.updateCells && !request.updateCells.rows);
    assert.deepEqual(clear?.updateCells.range, { sheetId: 7 });
    const write = requests.find((request) => request.updateCells?.rows);
    const cells = write?.updateCells.rows[0].values;
    assert.deepEqual(cells[0].userEnteredValue, { stringValue: "Tổng" });
    assert.deepEqual(cells[1].userEnteredValue, { numberValue: 1500000 });
    assert.equal(cells[1].userEnteredFormat.numberFormat.type, "NUMBER");
  });

  test("creates a missing tab at the front", () => {
    const requests = buildTabRequests({ sheetId: 202610, title: "T10-2026", rows: [], create: true }) as Array<Record<string, any>>;
    assert.equal(requests[0].addSheet.properties.title, "T10-2026");
    assert.equal(requests[0].addSheet.properties.index, 0);
  });
});
