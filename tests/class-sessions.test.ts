import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  addDays,
  buildCalendar,
  countScheduledInRange,
  effectiveRangesOverlap,
  isoWeekdayOf,
  monthRange,
  parseIsoDate,
  startOfWeek,
  suggestSessions,
  todayInVietnam,
  type ScheduleSlot,
  type SessionAdjustment
} from "../src/lib/class-sessions";
import { buildParentNotice } from "../src/lib/parent-notice";

const slot = (overrides: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  id: "s1",
  classId: "c1",
  weekday: 2,
  startTime: "18:00",
  endTime: "19:30",
  room: "",
  effectiveFrom: null,
  effectiveTo: null,
  ...overrides
});

const adjustment = (overrides: Partial<SessionAdjustment["previous"]> = {}, scheduled: number | null = 8): SessionAdjustment => ({
  month: 11,
  year: 2026,
  scheduled,
  previous: { month: 10, year: 2026, cancelled: [], makeups: [], ...overrides }
});

describe("ngày ISO", () => {
  test("parse chặn ngày không tồn tại", () => {
    assert.equal(parseIsoDate("2026-02-29"), null);
    assert.equal(parseIsoDate("2028-02-29"), "2028-02-29");
    assert.equal(parseIsoDate("15/10/2026"), null);
  });

  test("thứ và đầu tuần (Thứ 2)", () => {
    // 2026-10-12 là Thứ 2, 2026-10-18 là Chủ nhật.
    assert.equal(isoWeekdayOf("2026-10-12"), 1);
    assert.equal(isoWeekdayOf("2026-10-18"), 7);
    assert.equal(startOfWeek("2026-10-18"), "2026-10-12");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });

  test("hôm nay theo giờ Việt Nam", () => {
    // 18:30 UTC ngày 11 = 01:30 sáng ngày 12 ở Việt Nam.
    assert.equal(todayInVietnam(new Date("2026-10-11T18:30:00Z")), "2026-10-12");
  });

  test("giao khoảng hiệu lực", () => {
    assert.equal(effectiveRangesOverlap({ effectiveFrom: null, effectiveTo: "2026-10-31" }, { effectiveFrom: "2026-11-01", effectiveTo: null }), false);
    assert.equal(effectiveRangesOverlap({ effectiveFrom: null, effectiveTo: null }, { effectiveFrom: "2026-11-01", effectiveTo: null }), true);
  });
});

describe("buildCalendar", () => {
  test("ghép điểm danh vào buổi theo lịch, buổi bù hiện riêng, phân biệt chưa điểm danh / sắp tới", () => {
    const calendar = buildCalendar({
      slots: [slot()],
      records: [
        { id: "r1", classId: "c1", date: "2026-10-06", startTime: "18:00", endTime: "19:30", room: "", status: "cancelled", reason: "GV ốm" },
        { id: "r2", classId: "c1", date: "2026-10-08", startTime: "18:00", endTime: "19:30", room: "", status: "makeup", reason: null }
      ],
      from: "2026-10-05",
      to: "2026-10-18",
      today: "2026-10-13"
    });
    assert.deepEqual(
      calendar.map((session) => [session.date, session.status, session.scheduled]),
      [
        ["2026-10-06", "cancelled", true],
        ["2026-10-08", "makeup", false],
        ["2026-10-13", "upcoming", true]
      ]
    );
    assert.equal(calendar[0].reason, "GV ốm");
  });

  test("buổi đã qua chưa điểm danh là pending; lịch ngừng không sinh buổi sau ngày ngừng", () => {
    const calendar = buildCalendar({
      slots: [slot({ effectiveTo: "2026-10-13" })],
      records: [],
      from: "2026-10-01",
      to: "2026-10-31",
      today: "2026-10-14"
    });
    assert.deepEqual(calendar.map((session) => session.date), ["2026-10-06", "2026-10-13"]);
    assert.ok(calendar.every((session) => session.status === "pending"));
  });
});

describe("countScheduledInRange", () => {
  test("đếm theo lịch có hiệu lực trong tháng", () => {
    const { from, to } = monthRange(10, 2026);
    // Tháng 10/2026: Thứ 3 có 4 buổi (6, 13, 20, 27), Thứ 5 có 5 buổi (1, 8, 15, 22, 29).
    assert.equal(countScheduledInRange([slot(), slot({ id: "s2", weekday: 4 })], from, to), 9);
    // Thứ 5 chỉ áp dụng từ 15/10: 15, 22, 29.
    assert.equal(countScheduledInRange([slot(), slot({ id: "s2", weekday: 4, effectiveFrom: "2026-10-15" })], from, to), 7);
  });
});

describe("suggestSessions", () => {
  const base = { classDefault: 10, sessionsOverride: null, startDate: "2026-01-01", billedPreviousMonth: true };

  test("lịch tháng này trừ buổi nghỉ chưa bù tháng trước, kèm lý do", () => {
    const suggestion = suggestSessions({
      ...base,
      adjustment: adjustment({ cancelled: [{ date: "2026-10-15", reason: "GV ốm" }] })
    });
    assert.equal(suggestion.sessions, 7);
    assert.equal(suggestion.hint, "8 theo lịch − 1 nghỉ T10");
    assert.equal(suggestion.note, "đã trừ 1 buổi lớp nghỉ T10: 15/10 (GV ốm)");
  });

  test("học bù bù trừ buổi nghỉ", () => {
    const suggestion = suggestSessions({
      ...base,
      adjustment: adjustment({
        cancelled: [{ date: "2026-10-15", reason: null }],
        makeups: [{ date: "2026-10-18", reason: null }]
      })
    });
    assert.equal(suggestion.sessions, 8);
    assert.equal(suggestion.note, "");
  });

  test("tháng trước không có hóa đơn (mới vào / bảo lưu) thì không trừ", () => {
    const suggestion = suggestSessions({
      ...base,
      billedPreviousMonth: false,
      adjustment: adjustment({ cancelled: [{ date: "2026-10-15", reason: null }] })
    });
    assert.equal(suggestion.sessions, 8);
  });

  test("chỉ trừ buổi nghỉ từ ngày học sinh bắt đầu học", () => {
    const suggestion = suggestSessions({
      ...base,
      startDate: "2026-10-10",
      adjustment: adjustment({
        cancelled: [
          { date: "2026-10-06", reason: null },
          { date: "2026-10-20", reason: null }
        ]
      })
    });
    assert.equal(suggestion.sessions, 7);
    assert.equal(suggestion.note, "đã trừ 1 buổi lớp nghỉ T10: 20/10");
  });

  test("buổi riêng của học sinh và lớp chưa xếp lịch", () => {
    assert.equal(suggestSessions({ ...base, sessionsOverride: 4, adjustment: adjustment() }).sessions, 4);
    const unscheduled = suggestSessions({ ...base, adjustment: adjustment({}, null) });
    assert.equal(unscheduled.sessions, 10);
    assert.equal(unscheduled.hint, "10 mặc định");
  });
});

describe("buildParentNotice", () => {
  test("gọn, không có mã lớp, kèm số buổi và lý do trừ", () => {
    const message = buildParentNotice({
      className: "Toán 9",
      payUrl: "https://x/pay/T9-abc",
      month: 11,
      year: 2026,
      rows: [
        { status: "unpaid", sessions: 7 },
        { status: "not_created", sessions: 7 },
        { status: "on_leave", sessions: 0 }
      ],
      adjustmentNote: "đã trừ 1 buổi lớp nghỉ T10: 15/10 (GV ốm)"
    });
    assert.match(message, /^Kính gửi phụ huynh lớp Toán 9,$/m);
    assert.match(message, /Học phí Tháng 11\/2026 \(7 buổi, đã trừ 1 buổi lớp nghỉ T10: 15\/10 \(GV ốm\)\)\./);
    assert.ok(!message.includes("(T9)"));
    assert.ok(message.split("\n").length <= 5);
  });

  test("số buổi khác nhau thì không ghi số buổi chung", () => {
    const message = buildParentNotice({
      className: "Toán 9",
      payUrl: "u",
      month: 11,
      year: 2026,
      rows: [
        { status: "unpaid", sessions: 7 },
        { status: "unpaid", sessions: 8 }
      ],
      adjustmentNote: ""
    });
    assert.match(message, /Học phí Tháng 11\/2026\./);
  });
});
