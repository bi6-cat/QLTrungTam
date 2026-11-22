import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { readBankEnv } from "../src/lib/settings";

const KEYS = ["BANK_ACCOUNT_NUMBER", "BANK_ACCOUNT_NAME", "BANK_BIN", "NEXT_PUBLIC_APP_URL"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("bank info comes only from env", () => {
  test("valid values are used as-is", () => {
    Object.assign(process.env, {
      BANK_ACCOUNT_NUMBER: "0123456789",
      BANK_ACCOUNT_NAME: "APLUS ACADEMY",
      BANK_BIN: "970407",
      NEXT_PUBLIC_APP_URL: "https://aplus.example.vn/"
    });
    assert.deepEqual(readBankEnv(), {
      bankAccountNumber: "0123456789",
      bankAccountName: "APLUS ACADEMY",
      bankBin: "970407",
      appUrl: "https://aplus.example.vn",
      problems: []
    });
  });

  test("missing or malformed values are blanked, never defaulted", () => {
    for (const key of KEYS) delete process.env[key];
    process.env.BANK_ACCOUNT_NUMBER = "0123-456/../x";
    process.env.NEXT_PUBLIC_APP_URL = "https://evil.example/path?x=1";
    const bank = readBankEnv();
    assert.equal(bank.bankAccountNumber, "");
    assert.equal(bank.appUrl, "");
    assert.deepEqual(bank.problems.sort(), [...KEYS].sort());
  });
});
