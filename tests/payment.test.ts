import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildMemo,
  buildVietQrImageUrl,
  normalizePhone,
  parseMemo
} from "../src/lib/payment";

describe("normalizePhone", () => {
  test("keeps digits and removes common phone formatting", () => {
    assert.equal(normalizePhone("(+84) 912-345.678"), "84912345678");
  });

  test("returns an empty string when the input has no digits", () => {
    assert.equal(normalizePhone("khong-co-so"), "");
  });
});

describe("buildMemo", () => {
  test("builds the canonical uppercase memo with a normalized phone", () => {
    assert.equal(buildMemo("toan-6", "0912 345 678", 7, 2026), "HP TOAN-6 0912345678 26T7");
  });

  test("uses the last two digits of the year and does not pad the month", () => {
    assert.equal(buildMemo("a_1", "090-000-0000", 1, 2004), "HP A_1 0900000000 04T1");
  });

  test("produces a memo that parseMemo can read", () => {
    const memo = buildMemo("hoa_12-a", "+84 912 345 678", 12, 2027);

    assert.deepEqual(parseMemo(memo), {
      shortCode: "HOA_12-A",
      phone: "84912345678",
      year: 2027,
      month: 12
    });
  });
});

describe("parseMemo", () => {
  test("is case-insensitive and finds a valid memo inside bank content", () => {
    assert.deepEqual(parseMemo("MBVCB.123456 hp van-8 0912345678 26t9 chuyen tien"), {
      shortCode: "VAN-8",
      phone: "0912345678",
      year: 2026,
      month: 9
    });
  });

  test("supports the legacy memo form without a year", () => {
    assert.deepEqual(parseMemo("HP LY_9 0987654321 T10"), {
      shortCode: "LY_9",
      phone: "0987654321",
      year: null,
      month: 10
    });
  });

  test("accepts phone numbers at the documented parser boundaries", () => {
    assert.equal(parseMemo("HP A 12345678 26T1")?.phone, "12345678");
    assert.equal(parseMemo("HP A 123456789012 26T12")?.phone, "123456789012");
  });

  test("rejects invalid phone lengths", () => {
    assert.equal(parseMemo("HP A 1234567 26T1"), null);
    assert.equal(parseMemo("HP A 1234567890123 26T1"), null);
  });

  test("rejects months outside 1 through 12", () => {
    assert.equal(parseMemo("HP A 0912345678 26T0"), null);
    assert.equal(parseMemo("HP A 0912345678 26T13"), null);
  });

  test("rejects content that does not contain a complete memo", () => {
    assert.equal(parseMemo("chuyen hoc phi thang 7"), null);
    assert.equal(parseMemo("HP TOAN-6 0912345678"), null);
  });
});

describe("buildVietQrImageUrl", () => {
  test("places the account in the path and safely encodes payment details", () => {
    const value = buildVietQrImageUrl({
      bankBin: "970436",
      accountNumber: "123456789",
      accountName: "TRUNG TAM A & B",
      amount: 1_250_000,
      memo: "HP TOAN-6 0912345678 26T7"
    });
    const url = new URL(value);

    assert.equal(url.origin, "https://img.vietqr.io");
    assert.equal(url.pathname, "/image/970436-123456789-compact2.png");
    assert.equal(url.searchParams.get("amount"), "1250000");
    assert.equal(url.searchParams.get("addInfo"), "HP TOAN-6 0912345678 26T7");
    assert.equal(url.searchParams.get("accountName"), "TRUNG TAM A & B");
  });
});
