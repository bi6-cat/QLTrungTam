import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { formatCurrency, formatMonth, formatTimeDay, parseVietnamDateTime, toInt, toText } from "../src/lib/format";

describe("format helpers", () => {
  test("formats VND without fractional digits", () => {
    const formatted = formatCurrency(1_234_567);

    assert.match(formatted, /1[.\s]234[.\s]567/);
    assert.match(formatted, /(?:₫|VND)/);
    assert.doesNotMatch(formatted, /[,\.]00\b/);
  });

  test("includes the requested month and year", () => {
    assert.match(formatMonth(7, 2026), /7\/2026$/);
  });
});

describe("form value conversion", () => {
  test("toInt accepts finite numeric strings", () => {
    assert.equal(toInt("42"), 42);
    assert.equal(toInt(" 12.5 "), 12.5);
    assert.equal(toInt(""), 0);
  });

  test("toInt uses its fallback for invalid and non-finite values", () => {
    assert.equal(toInt("khong-phai-so", 9), 9);
    assert.equal(toInt("Infinity", 9), 9);
  });

  test("toInt currently treats a missing form value as zero", () => {
    assert.equal(toInt(null, 9), 0);
  });

  test("toText trims strings and normalizes a missing value", () => {
    assert.equal(toText("  Nguyen Van A  "), "Nguyen Van A");
    assert.equal(toText(null), "");
  });
});

describe("Vietnam date-time helpers", () => {
  test("formats hour and day in Vietnam time", () => {
    assert.equal(formatTimeDay(new Date("2026-11-05T13:00:00Z")), "20:00 05/11");
    assert.equal(formatTimeDay(new Date("2026-11-05T17:30:00Z")), "00:30 06/11");
  });

  test("reads a datetime-local value as Vietnam time", () => {
    assert.equal(parseVietnamDateTime("2026-11-05T20:00")?.toISOString(), "2026-11-05T13:00:00.000Z");
    assert.equal(parseVietnamDateTime(""), null);
    assert.equal(parseVietnamDateTime("2026-13-05T20:00"), null);
    assert.equal(parseVietnamDateTime("05/11/2026 20:00"), null);
  });
});
