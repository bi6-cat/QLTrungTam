import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isEnrollmentActiveInPeriod,
  periodIndex,
  remainingScheduledSessions
} from "../src/lib/enrollment-period";

describe("isEnrollmentActiveInPeriod", () => {
  test("chua nghi thi luon con hoc", () => {
    assert.equal(isEnrollmentActiveInPeriod(null, 10, 2026), true);
  });

  test("nghi tu thang 11 van hoc thang 10, khong hoc tu thang 11", () => {
    const leftAt = new Date(2026, 10, 1);
    assert.equal(isEnrollmentActiveInPeriod(leftAt, 10, 2026), true);
    assert.equal(isEnrollmentActiveInPeriod(leftAt, 11, 2026), false);
    assert.equal(isEnrollmentActiveInPeriod(leftAt, 1, 2027), false);
  });
});

describe("periodIndex", () => {
  test("so sanh dung qua nam", () => {
    assert.ok(periodIndex(12, 2026) < periodIndex(1, 2027));
    assert.equal(periodIndex(1, 2027) - periodIndex(12, 2026), 1);
  });
});

describe("remainingScheduledSessions", () => {
  // Thang 10/2026: Thu 3 ngay 6, 13, 20, 27; Thu 5 ngay 1, 8, 15, 22, 29.
  const tueThu = [{ weekday: 2 }, { weekday: 4 }];

  test("vao lop ngay dau thang thi tinh ca thang", () => {
    assert.equal(remainingScheduledSessions(tueThu, new Date(2026, 9, 1), 10, 2026), 9);
  });

  test("vao lop giua thang chi dem buoi tu ngay vao", () => {
    assert.equal(remainingScheduledSessions(tueThu, new Date(2026, 9, 20, 15, 30), 10, 2026), 4);
  });

  test("ngay vao lop khac ky thi khong goi y", () => {
    assert.equal(remainingScheduledSessions(tueThu, new Date(2026, 8, 20), 10, 2026), null);
  });

  test("lop chua xep lich thi khong goi y", () => {
    assert.equal(remainingScheduledSessions([], new Date(2026, 9, 20), 10, 2026), null);
  });
});
