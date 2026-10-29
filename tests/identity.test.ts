import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { decodeSessionToken, encodeSessionToken } from "../src/lib/session-token";
import {
  generatePin,
  generateStudentCode,
  isValidPin,
  isWeakPin,
  normalizeStudentCode,
  STUDENT_CODE_LENGTH
} from "../src/modules/identity/credentials";
import { isLocked, lockAfterFailure, LOCK_MINUTES, MAX_FAILED_LOGINS, minutesUntil } from "../src/modules/identity/lockout";
import { decodePortalToken, encodePortalToken } from "../src/modules/identity/portal-token";

describe("student code", () => {
  test("is 6 characters without look-alike characters", () => {
    const codes = Array.from({ length: 500 }, generateStudentCode);
    for (const code of codes) {
      assert.equal(code.length, STUDENT_CODE_LENGTH);
      assert.doesNotMatch(code, /[01ILO]/);
      assert.equal(normalizeStudentCode(code), code);
    }
    assert.ok(new Set(codes).size > 495, "mã sinh ra phải gần như không trùng");
  });

  test("normalizes what students type", () => {
    assert.equal(normalizeStudentCode(" k7m-2xq "), "K7M2XQ");
    assert.equal(normalizeStudentCode("K7M 2XQ"), "K7M2XQ");
  });

  test("rejects wrong length and characters outside the alphabet", () => {
    assert.equal(normalizeStudentCode("K7M2X"), null);
    assert.equal(normalizeStudentCode("K7M2XQQ"), null);
    assert.equal(normalizeStudentCode("K7M2X0"), null);
    assert.equal(normalizeStudentCode(""), null);
  });
});

describe("PIN", () => {
  test("must be exactly 6 digits", () => {
    assert.equal(isValidPin("048213"), true);
    assert.equal(isValidPin("48213"), false);
    assert.equal(isValidPin("0482135"), false);
    assert.equal(isValidPin("04821a"), false);
  });

  test("flags repeated digits and straight sequences as weak", () => {
    for (const pin of ["000000", "777777", "123456", "456789", "987654", "543210"]) assert.equal(isWeakPin(pin), true, pin);
    for (const pin of ["048213", "112233", "135791", "123457"]) assert.equal(isWeakPin(pin), false, pin);
  });

  test("generated PINs are valid and never weak", () => {
    for (let i = 0; i < 500; i++) {
      const pin = generatePin();
      assert.equal(isValidPin(pin), true);
      assert.equal(isWeakPin(pin), false);
    }
  });
});

describe("lockout", () => {
  const now = new Date("2026-10-29T10:00:00Z");

  test("locks only when the failure count reaches the limit", () => {
    assert.equal(lockAfterFailure(MAX_FAILED_LOGINS - 1, now), null);
    const lock = lockAfterFailure(MAX_FAILED_LOGINS, now);
    assert.ok(lock);
    assert.equal(lock.failedLogins, 0);
    assert.equal(lock.lockedUntil.getTime() - now.getTime(), LOCK_MINUTES * 60_000);
  });

  test("is locked until the time passes", () => {
    const until = new Date(now.getTime() + 60_000);
    assert.equal(isLocked(until, now), true);
    assert.equal(isLocked(until, new Date(until.getTime() + 1)), false);
    assert.equal(isLocked(null, now), false);
  });

  test("reports at least one minute remaining", () => {
    assert.equal(minutesUntil(new Date(now.getTime() + 10_000), now), 1);
    assert.equal(minutesUntil(new Date(now.getTime() + 14.5 * 60_000), now), 15);
  });
});

describe("portal token", () => {
  const session = { sub: "t1", ver: 2, exp: Date.now() + 60_000 };

  test("round-trips within the same portal", () => {
    assert.deepEqual(decodePortalToken("teacher", encodePortalToken("teacher", session)), session);
  });

  test("a teacher token is not a student token and vice versa", () => {
    assert.equal(decodePortalToken("student", encodePortalToken("teacher", session)), null);
    assert.equal(decodePortalToken("teacher", encodePortalToken("student", session)), null);
  });

  test("portal and admin tokens are not interchangeable", () => {
    const adminToken = encodeSessionToken({ userId: "t1", username: "admin", role: "owner", exp: Date.now() + 60_000 });
    assert.equal(decodePortalToken("teacher", adminToken), null);
    assert.equal(decodeSessionToken(encodePortalToken("teacher", session)), null);
  });

  test("rejects tampered, expired and malformed tokens", () => {
    const [, signature] = encodePortalToken("student", session).split(".");
    const forged = Buffer.from(JSON.stringify({ ...session, sub: "someone-else" })).toString("base64url");
    assert.equal(decodePortalToken("student", `${forged}.${signature}`), null);
    assert.equal(decodePortalToken("student", encodePortalToken("student", { ...session, exp: Date.now() - 1 })), null);
    assert.equal(decodePortalToken("student", "garbage"), null);
    assert.equal(decodePortalToken("student", undefined), null);
  });

  test("rejects payloads missing the session version", () => {
    const token = encodePortalToken("teacher", { sub: "t1", exp: Date.now() + 60_000 } as never);
    assert.equal(decodePortalToken("teacher", token), null);
  });
});
