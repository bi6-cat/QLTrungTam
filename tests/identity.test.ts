import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { decodeSessionToken, encodeSessionToken } from "../src/lib/session-token";
import {
  formatStudentCode,
  generatePin,
  isValidPin,
  isWeakPin,
  nextStudentCodeNumber,
  studentCodeBase,
  studentCodeKey
} from "../src/modules/identity/credentials";
import {
  isLocked,
  lockAfterFailure,
  LOCK_MINUTES,
  MAX_FAILED_LOGINS,
  minutesUntil,
  STUDENT_MAX_FAILED_LOGINS
} from "../src/modules/identity/lockout";
import { decodePortalToken, encodePortalToken } from "../src/modules/identity/portal-token";
import { portalForPath } from "../src/modules/identity/portal-paths";
import { teacherNameKey } from "../src/modules/center/teacher-classes";

describe("student code", () => {
  test("is the given name without accents plus initials of family and middle names", () => {
    assert.equal(studentCodeBase("Nguyễn Văn Hương"), "HuongNV");
    assert.equal(studentCodeBase("  lê   thị   đào "), "DaoLT");
    assert.equal(studentCodeBase("Trần Đức Anh Khoa"), "KhoaTDA");
    assert.equal(studentCodeBase("Minh"), "Minh");
    assert.equal(studentCodeBase("Phạm Nguyễn Hoàng Bảo Ngọc"), "NgocPNHB");
    assert.equal(studentCodeBase("Ngô Thị Ánh (12A)"), "AnhNT");
    assert.equal(studentCodeBase("Vũ Minh 2"), "MinhV");
    assert.equal(studentCodeBase("  "), "HocSinh");
  });

  test("numbers start at 01 and take the first free number, ignoring case and other names", () => {
    assert.equal(formatStudentCode("HuongNV", 2), "HuongNV02");
    assert.equal(formatStudentCode("HuongNV", 100), "HuongNV100");
    assert.equal(nextStudentCodeNumber("HuongNV", []), 1);
    assert.equal(nextStudentCodeNumber("HuongNV", ["HuongNV01", "huongnv03", "HuongNVA01", "HuongNV1x"]), 2);
    assert.equal(nextStudentCodeNumber("Huong", ["HuongNV01"]), 1);
  });

  test("login key ignores case, spaces and dashes; old random codes still work", () => {
    assert.equal(studentCodeKey(" huongnv-02 "), "huongnv02");
    assert.equal(studentCodeKey("HuongNV 02"), "huongnv02");
    assert.equal(studentCodeKey("K7M2XQ"), "k7m2xq");
    assert.equal(studentCodeKey("abc"), null);
    assert.equal(studentCodeKey("Hương01"), null);
    assert.equal(studentCodeKey(""), null);
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
    assert.equal(lockAfterFailure(STUDENT_MAX_FAILED_LOGINS - 1, now, STUDENT_MAX_FAILED_LOGINS), null);
    assert.notEqual(lockAfterFailure(STUDENT_MAX_FAILED_LOGINS, now, STUDENT_MAX_FAILED_LOGINS), null);
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

describe("teacher name matching", () => {
  test("ignores case, extra spaces and composed vs decomposed accents", () => {
    const composed = "Cô Hạnh";
    const decomposed = composed.normalize("NFD");
    assert.notEqual(composed, decomposed);
    assert.equal(teacherNameKey(`  cô   HẠNH `), teacherNameKey(composed));
    assert.equal(teacherNameKey(decomposed), teacherNameKey(composed));
  });

  test("keeps different names apart", () => {
    assert.notEqual(teacherNameKey("Cô Hà"), teacherNameKey("Cô Hạnh"));
    assert.notEqual(teacherNameKey("Cô Hạnh"), teacherNameKey("Cô Hanh"));
  });
});

describe("portalForPath", () => {
  test("teacher portal pages need a teacher session", () => {
    for (const path of ["/teacher", "/teacher/", "/teacher/account", "/teacher/vocab/abc"]) assert.equal(portalForPath(path), "teacher", path);
  });

  test("old teacher class links stay public", () => {
    assert.equal(portalForPath("/teacher/classes/L10A-k7m2x9pq4r"), null);
    assert.equal(portalForPath("/teacher/classes/L10A-k7m2x9pq4r/"), null);
    // Sâu hơn một cấp dưới /teacher/classes không phải link cũ.
    assert.equal(portalForPath("/teacher/classes/L10A-k7m2x9pq4r/extra"), "teacher");
    assert.equal(portalForPath("/teacher/classes"), "teacher");
  });

  test("student portal pages need a student session", () => {
    for (const path of ["/learn", "/learn/classes", "/learn/quiz/1"]) assert.equal(portalForPath(path), "student", path);
  });

  test("other paths are not portal paths", () => {
    for (const path of ["/", "/login", "/admin", "/teachers", "/learning", "/pay/L10A-x", "/survey/L10A-x"]) {
      assert.equal(portalForPath(path), null, path);
    }
  });
});
