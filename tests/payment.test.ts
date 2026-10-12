import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  buildMemo,
  buildVietQrImageUrl,
  normalizePhone,
  parseMemo,
  pickMemoSuffix,
  predictMemos,
  usedMemoSuffixes
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
      suffix: "",
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
      suffix: "",
      year: 2026,
      month: 9
    });
  });

  test("supports the legacy memo form without a year", () => {
    assert.deepEqual(parseMemo("HP LY_9 0987654321 T10"), {
      shortCode: "LY_9",
      phone: "0987654321",
      suffix: "",
      year: null,
      month: 10
    });
  });

  test("accepts a memo whose HP prefix, class code and phone are joined by the bank", () => {
    assert.deepEqual(parseMemo("HPLS12A0987787878 26T8"), {
      shortCode: "LS12A",
      phone: "0987787878",
      suffix: "",
      year: 2026,
      month: 8
    });
  });

  test("accepts a joined memo when the class code ends in a digit", () => {
    assert.deepEqual(parseMemo("HPENA2091234567826T8"), {
      shortCode: "ENA2",
      phone: "0912345678",
      suffix: "",
      year: 2026,
      month: 8
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

describe("memo suffix for siblings sharing a phone", () => {
  test("builds and parses a suffixed memo", () => {
    const memo = buildMemo("ls12a", "0987787878", 8, 2026, "b");
    assert.equal(memo, "HP LS12A 0987787878B 26T8");
    assert.deepEqual(parseMemo(memo), {
      shortCode: "LS12A",
      phone: "0987787878",
      suffix: "B",
      year: 2026,
      month: 8
    });
  });

  test("reads the suffix in bank content that strips spaces", () => {
    assert.deepEqual(parseMemo("HPLS12A0987787878B 26T8"), {
      shortCode: "LS12A",
      phone: "0987787878",
      suffix: "B",
      year: 2026,
      month: 8
    });
  });

  test("a legacy memo without a year still reads the suffix", () => {
    assert.equal(parseMemo("HP LY_9 0987654321C T10")?.suffix, "C");
  });

  test("a plain memo has an empty suffix", () => {
    assert.equal(parseMemo("HP A 0912345678 T10")?.suffix, "");
  });

  test("picks the first unused suffix and reports exhaustion", () => {
    assert.equal(pickMemoSuffix([]), "");
    assert.equal(pickMemoSuffix([""]), "B");
    assert.equal(pickMemoSuffix(["", "B", "D"]), "C");
    assert.equal(pickMemoSuffix(["", "B", "C", "D", "E", "F", "G", "H"]), null);
  });

  test("only counts suffixes of memos with the same phone", () => {
    const memos = ["HP LS12A 0987787878 26T8", "HP LS12A 0911111111 26T8", "HP LS12A 0987787878B 26T8", "khong-doc-duoc"];
    assert.deepEqual(usedMemoSuffixes(memos, "0987 787 878"), ["", "B"]);
  });

  test("predicts memos in order, keeping the first sibling's memo unchanged", () => {
    const predicted = predictMemos({
      shortCode: "LS12A",
      month: 8,
      year: 2026,
      issuedMemos: [],
      pending: [
        { key: "a", phone: "0987787878" },
        { key: "b", phone: "0987787878" },
        { key: "c", phone: "0911111111" },
        { key: "d", phone: "0987787878" }
      ]
    });
    assert.equal(predicted.get("a")?.memo, "HP LS12A 0987787878 26T8");
    assert.equal(predicted.get("b")?.memo, "HP LS12A 0987787878B 26T8");
    assert.equal(predicted.get("c")?.suffix, "");
    assert.equal(predicted.get("d")?.memo, "HP LS12A 0987787878C 26T8");
  });

  test("predicts after an already issued memo", () => {
    const predicted = predictMemos({
      shortCode: "LS12A",
      month: 8,
      year: 2026,
      issuedMemos: ["HP LS12A 0987787878 26T8"],
      pending: [{ key: "x", phone: "0987787878" }]
    });
    assert.equal(predicted.get("x")?.memo, "HP LS12A 0987787878B 26T8");
  });
});
