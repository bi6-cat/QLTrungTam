import assert from "node:assert/strict";
import { after, afterEach, before, describe, test } from "node:test";

import { prisma } from "../src/lib/prisma";
import { isoToDbDate } from "../src/lib/class-sessions";
import { loadSessionSuggestions } from "../src/lib/class-sessions-server";
import {
  addMakeupSession,
  cancelDay,
  clearSession,
  createScheduleSlot,
  markPendingSessionsHeld,
  markSession,
  stopScheduleSlot
} from "../src/lib/class-session-ops";
import { assertSafeLedgerIntegrationDatabase, LedgerTestHarness, type LedgerFixture } from "./helpers/ledger-test-db";

assertSafeLedgerIntegrationDatabase();

const harness = new LedgerTestHarness();
const markedBy = "ledger-it";

// Tháng 9/2026: Thứ 3 rơi vào 1, 8, 15, 22, 29. Tháng 10/2026: Thứ 3 rơi vào 6, 13, 20, 27.
async function tuesdayClass(fixture: LedgerFixture) {
  await createScheduleSlot(prisma, {
    classId: fixture.classId,
    weekday: 2,
    startTime: "18:00",
    endTime: "19:30",
    room: "P.1",
    note: null,
    effectiveFrom: "2026-09-01"
  });
}

async function billSeptember(fixture: LedgerFixture) {
  await prisma.monthlyInvoice.create({
    data: {
      enrollmentId: fixture.enrollmentId,
      month: 9,
      year: 2026,
      sessions: 5,
      pricePerSession: 100_000,
      amount: 500_000,
      memoContent: `IT-SESSIONS-${fixture.classId}`
    }
  });
  await prisma.enrollment.update({ where: { id: fixture.enrollmentId }, data: { startDate: new Date(2026, 7, 1) } });
}

async function suggestOctober(fixture: LedgerFixture) {
  const classRoom = await prisma.classRoom.findUniqueOrThrow({ where: { id: fixture.classId } });
  const enrollments = await prisma.enrollment.findMany({ where: { classId: fixture.classId } });
  const result = await loadSessionSuggestions(prisma, { classRoom, month: 10, year: 2026, enrollments });
  return result.byEnrollment.get(fixture.enrollmentId)!;
}

describe("thời khóa biểu: điểm danh và gợi ý số buổi", { concurrency: false }, () => {
  before(async () => {
    await harness.start();
  });

  afterEach(async () => {
    await harness.cleanupFixtures();
  });

  after(async () => {
    await harness.stop();
  });

  test("buổi nghỉ tháng 9 trừ vào tháng 10; buổi dời (nghỉ + bù) không trừ", async () => {
    const fixture = await harness.createFixture();
    await tuesdayClass(fixture);
    await billSeptember(fixture);

    assert.deepEqual(await suggestOctober(fixture), { sessions: 4, hint: "4 theo lịch", note: "" });

    await markSession(prisma, { classId: fixture.classId, date: "2026-09-15", startTime: "18:00", status: "cancelled", reason: "GV ốm" }, markedBy);
    await addMakeupSession(
      prisma,
      { classId: fixture.classId, date: "2026-09-24", startTime: "18:00", endTime: "19:30", room: "", reason: null, fromDate: "2026-09-22", fromStartTime: "18:00" },
      markedBy
    );

    const moved = await prisma.classSession.findUniqueOrThrow({
      where: { classId_date_startTime: { classId: fixture.classId, date: isoToDbDate("2026-09-22"), startTime: "18:00" } }
    });
    assert.equal(moved.status, "cancelled");
    assert.equal(moved.reason, "Dời sang 24/09");

    assert.deepEqual(await suggestOctober(fixture), {
      sessions: 3,
      hint: "4 theo lịch − 1 nghỉ T9",
      note: "đã trừ 1 buổi lớp nghỉ T9: 15/09 (GV ốm)"
    });
  });

  test("học sinh không có hóa đơn tháng trước thì không bị trừ", async () => {
    const fixture = await harness.createFixture();
    await tuesdayClass(fixture);
    await markSession(prisma, { classId: fixture.classId, date: "2026-09-15", startTime: "18:00", status: "cancelled", reason: null }, markedBy);
    assert.equal((await suggestOctober(fixture)).sessions, 4);
  });

  test("điểm danh hàng loạt, nghỉ cả ngày, bỏ điểm danh", async () => {
    const fixture = await harness.createFixture();
    await tuesdayClass(fixture);

    assert.equal(await markPendingSessionsHeld(prisma, { from: "2026-09-01", to: "2026-09-30", classId: fixture.classId }, markedBy), 5);
    assert.equal(await markPendingSessionsHeld(prisma, { from: "2026-09-01", to: "2026-09-30", classId: fixture.classId }, markedBy), 0);

    const holiday = await cancelDay(prisma, { date: "2026-09-01", reason: "Nghỉ lễ" }, markedBy);
    assert.ok(holiday.count >= 1);
    const first = await prisma.classSession.findUniqueOrThrow({
      where: { classId_date_startTime: { classId: fixture.classId, date: isoToDbDate("2026-09-01"), startTime: "18:00" } }
    });
    assert.equal(first.status, "cancelled");
    assert.equal(first.reason, "Nghỉ lễ");

    await clearSession(prisma, first.id);
    assert.equal(await prisma.classSession.count({ where: { classId: fixture.classId } }), 4);
  });

  test("chặn điểm danh buổi không có trong lịch, học bù trùng giờ lịch, lịch trùng", async () => {
    const fixture = await harness.createFixture();
    await tuesdayClass(fixture);

    await assert.rejects(
      markSession(prisma, { classId: fixture.classId, date: "2026-09-16", startTime: "18:00", status: "held", reason: null }, markedBy),
      /không có buổi học/
    );
    await assert.rejects(
      addMakeupSession(prisma, { classId: fixture.classId, date: "2026-09-15", startTime: "18:00", endTime: "19:30", room: "", reason: null }, markedBy),
      /đã có buổi theo lịch/
    );
    await assert.rejects(
      createScheduleSlot(prisma, {
        classId: fixture.classId,
        weekday: 2,
        startTime: "18:00",
        endTime: "19:00",
        room: "",
        note: null,
        effectiveFrom: null
      }),
      /trùng thứ và giờ/
    );
  });

  test("ngừng lịch giữ buổi cũ; lịch mới cùng giờ sau ngày ngừng được phép", async () => {
    const fixture = await harness.createFixture();
    await tuesdayClass(fixture);
    const slot = await prisma.classSchedule.findFirstOrThrow({ where: { classId: fixture.classId } });

    assert.equal(await stopScheduleSlot(prisma, { id: slot.id, fromDate: "2026-10-01" }), "stopped");
    await createScheduleSlot(prisma, {
      classId: fixture.classId,
      weekday: 2,
      startTime: "18:00",
      endTime: "20:00",
      room: "",
      note: null,
      effectiveFrom: "2026-10-01"
    });
    assert.equal(await prisma.classSchedule.count({ where: { classId: fixture.classId } }), 2);

    // Lịch chưa từng chạy trước ngày ngừng thì xóa hẳn.
    const future = await prisma.classSchedule.findFirstOrThrow({ where: { classId: fixture.classId, effectiveTo: null } });
    assert.equal(await stopScheduleSlot(prisma, { id: future.id, fromDate: "2026-10-01" }), "deleted");
  });
});
