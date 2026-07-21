import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { hashPassword, verifyPassword } from "../src/lib/password";

describe("password helpers", () => {
  test("hashes with scrypt and verifies the original password", () => {
    const stored = hashPassword("mat-khau-dung");

    assert.match(stored, /^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
    assert.equal(verifyPassword("mat-khau-dung", stored), true);
    assert.equal(verifyPassword("mat-khau-sai", stored), false);
  });

  test("uses a different salt for repeated hashes", () => {
    assert.notEqual(hashPassword("cung-mat-khau"), hashPassword("cung-mat-khau"));
  });

  test("rejects malformed or unsupported stored hashes", () => {
    assert.equal(verifyPassword("x", ""), false);
    assert.equal(verifyPassword("x", "bcrypt:salt:hash"), false);
    assert.equal(verifyPassword("x", "scrypt:missing-hash"), false);
  });
});
