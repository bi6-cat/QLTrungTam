import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  formatCurrency,
  formatDueIn,
  formatMonth,
  formatTimeDay,
  formatWeekdayDate,
  greetingFor,
  parseVietnamDateTime,
  toInt,
  toText
} from "../src/lib/format";

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

test("greeting follows Vietnam time of day", () => {
  assert.equal(greetingFor(new Date("2026-10-30T08:00:00+07:00")), "Chào buổi sáng");
  assert.equal(greetingFor(new Date("2026-10-30T12:00:00+07:00")), "Chào buổi trưa");
  assert.equal(greetingFor(new Date("2026-10-30T15:30:00+07:00")), "Chào buổi chiều");
  assert.equal(greetingFor(new Date("2026-10-30T21:00:00+07:00")), "Chào buổi tối");
  assert.equal(greetingFor(new Date("2026-10-30T01:30:00Z")), "Chào buổi sáng", "01:30 UTC là 08:30 giờ Việt Nam");
});

test("weekday date and due-in labels", () => {
  assert.equal(formatWeekdayDate(new Date("2026-10-30T10:00:00+07:00")), "Thứ Sáu, 30/10");
  const now = new Date("2026-10-30T10:00:00+07:00");
  const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000);
  assert.equal(formatDueIn(at(-1), now), "đã hết hạn");
  assert.equal(formatDueIn(at(45), now), "còn 45 phút");
  assert.equal(formatDueIn(at(5 * 60 + 10), now), "còn 5 giờ");
  assert.equal(formatDueIn(at(2 * 24 * 60 + 30), now), "còn 2 ngày");
  assert.equal(formatDueIn(at(10 * 24 * 60), now), "hạn 09/11");
});
