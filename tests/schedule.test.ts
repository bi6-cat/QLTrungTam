import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  countScheduledSessions,
  expenseCategoryLabel,
  isoWeekday,
  sortSchedules,
  weekdayLabel,
  weekdayOccurrencesInMonth
} from "../src/lib/schedule";

describe("isoWeekday", () => {
  test("quy Chu nhat ve 7 thay vi 0", () => {
    // 2026-07-26 la Chu nhat.
    assert.equal(isoWeekday(new Date(2026, 6, 26)), 7);
  });

  test("Thu 2 la 1", () => {
    // 2026-07-27 la Thu 2.
    assert.equal(isoWeekday(new Date(2026, 6, 27)), 1);
  });
});

describe("weekdayOccurrencesInMonth", () => {
  test("dem dung so lan moi thu trong thang 7/2026", () => {
    const counts = weekdayOccurrencesInMonth(7, 2026);

    // Thang 7/2026 co 31 ngay, bat dau vao Thu 4.
    assert.equal(counts[3], 5, "Thu 4: 1, 8, 15, 22, 29");
    assert.equal(counts[4], 5, "Thu 5: 2, 9, 16, 23, 30");
    assert.equal(counts[5], 5, "Thu 6: 3, 10, 17, 24, 31");
    assert.equal(counts[1], 4, "Thu 2: 6, 13, 20, 27");
    assert.equal(counts[7], 4, "Chu nhat: 5, 12, 19, 26");

    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    assert.equal(total, 31);
  });

  test("thang 2 nam nhuan cong du 29 ngay", () => {
    const counts = weekdayOccurrencesInMonth(2, 2028);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

    assert.equal(total, 29);
  });
});

describe("countScheduledSessions", () => {
  test("lop hoc Thu 2 - Thu 4 - Thu 6 co 14 buoi trong thang 7/2026", () => {
    const schedules = [{ weekday: 1 }, { weekday: 3 }, { weekday: 5 }];

    assert.equal(countScheduledSessions(schedules, 7, 2026), 4 + 5 + 5);
  });

  test("hai buoi cung mot thu duoc tinh gap doi", () => {
    const schedules = [{ weekday: 3 }, { weekday: 3 }];

    assert.equal(countScheduledSessions(schedules, 7, 2026), 10);
  });

  test("chua xep lich thi tra null de noi goi tu quyet dinh so buoi thay the", () => {
    assert.equal(countScheduledSessions([], 7, 2026), null);
  });

  test("so buoi doi theo tung thang", () => {
    const schedules = [{ weekday: 5 }];

    // Thang 7/2026 co 5 ngay Thu 6, thang 8/2026 chi co 4.
    assert.equal(countScheduledSessions(schedules, 7, 2026), 5);
    assert.equal(countScheduledSessions(schedules, 8, 2026), 4);
  });
});

describe("sortSchedules", () => {
  test("sap theo thu roi toi gio bat dau", () => {
    const sorted = sortSchedules([
      { weekday: 3, startTime: "18:00" },
      { weekday: 1, startTime: "19:45" },
      { weekday: 1, startTime: "08:00" }
    ]);

    assert.deepEqual(
      sorted.map((slot) => `${slot.weekday}-${slot.startTime}`),
      ["1-08:00", "1-19:45", "3-18:00"]
    );
  });

  test("khong sua mang goc", () => {
    const input = [{ weekday: 3, startTime: "18:00" }, { weekday: 1, startTime: "08:00" }];
    sortSchedules(input);

    assert.equal(input[0].weekday, 3);
  });
});

describe("nhan hien thi", () => {
  test("weekdayLabel tra dung ten thu", () => {
    assert.equal(weekdayLabel(1), "Thứ 2");
    assert.equal(weekdayLabel(7), "Chủ nhật");
  });

  test("expenseCategoryLabel roi ve 'Khac' khi khong nhan ra", () => {
    assert.equal(expenseCategoryLabel("teacher_salary"), "Lương giáo viên");
    assert.equal(expenseCategoryLabel("khong-ton-tai"), "Khác");
  });
});
