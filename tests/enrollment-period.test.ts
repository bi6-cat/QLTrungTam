import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  isEnrollmentActiveInPeriod,
  periodIndex,
  remainingScheduledSessions,
  resolveMonthPlan
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

describe("resolveMonthPlan", () => {
  const classRoom = { sessionsPerMonthDefault: 8, pricePerSession: 50_000 };
  const base = { month: 11, year: 2026, classRoom };

  test("a new month inherits the latest earlier status and resets sessions to the default", () => {
    const plan = resolveMonthPlan({
      ...base,
      latestMonth: { month: 10, year: 2026, status: "active", sessions: 5, pricePerSession: 40_000 },
      enrollment: { status: "on_leave", sessionsOverride: null }
    });
    assert.equal(plan.status, "active");
    assert.equal(plan.sessions, 8);
    assert.equal(plan.pricePerSession, 50_000);
    assert.equal(plan.initialized, false);
  });

  test("a student who was on leave last month stays on leave with zero sessions", () => {
    const plan = resolveMonthPlan({
      ...base,
      latestMonth: { month: 9, year: 2026, status: "on_leave", sessions: 0, pricePerSession: 50_000 },
      enrollment: { status: "active", sessionsOverride: 6 }
    });
    assert.equal(plan.status, "on_leave");
    assert.equal(plan.sessions, 0);
    assert.equal(plan.defaultSessions, 6);
  });

  test("without any earlier month the status chosen when joining is used", () => {
    const plan = resolveMonthPlan({ ...base, latestMonth: null, enrollment: { status: "on_leave", sessionsOverride: null } });
    assert.equal(plan.status, "on_leave");
    const active = resolveMonthPlan({ ...base, enrollment: { status: "active", sessionsOverride: 4 } });
    assert.equal(active.status, "active");
    assert.equal(active.sessions, 4);
  });

  test("an existing month plan or invoice wins over inherited values", () => {
    const planned = resolveMonthPlan({
      ...base,
      latestMonth: { month: 11, year: 2026, status: "on_leave", sessions: 0, pricePerSession: 45_000 },
      enrollment: { status: "active", sessionsOverride: null }
    });
    assert.equal(planned.status, "on_leave");
    assert.equal(planned.initialized, true);
    assert.equal(planned.pricePerSession, 45_000);

    const invoiced = resolveMonthPlan({
      ...base,
      latestMonth: { month: 10, year: 2026, status: "on_leave", sessions: 0, pricePerSession: 50_000 },
      invoice: { sessions: 7, pricePerSession: 55_000 },
      enrollment: { status: "on_leave", sessionsOverride: null }
    });
    assert.equal(invoiced.status, "active");
    assert.equal(invoiced.sessions, 7);
    assert.equal(invoiced.pricePerSession, 55_000);
  });
});
