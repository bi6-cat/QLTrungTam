"use server";

import type { z } from "zod";
import { successState, errorState, type ResultState } from "@/lib/action-states";
import { actionFailure, runSerializableAction } from "@/lib/actions/shared";
import { requireStaff } from "@/lib/auth";
import { formatIsoDayMonth, parseIsoDate } from "@/lib/class-sessions";
import {
  addMakeupSession,
  cancelDay,
  clearSession,
  createScheduleSlot,
  markPendingSessionsHeld,
  markSession,
  stopScheduleSlot,
  updateScheduleSlot
} from "@/lib/class-session-ops";
import { logAudit } from "@/lib/audit";
import { weekdayLabel } from "@/lib/schedule";
import {
  bulkHeldSchema,
  cancelDaySchema,
  createScheduleSchema,
  makeupSessionSchema,
  markSessionSchema,
  safeParseForm,
  updateScheduleSchema
} from "@/lib/validation";

// Toàn bộ thời khóa biểu (lịch cố định + điểm danh) do chủ và quản lý phụ cùng quản lý.

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  return result.data;
}

export async function createScheduleAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireStaff();
  const { data, error } = safeParseForm(createScheduleSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  try {
    const classRoom = await runSerializableAction(async (tx) => {
      const created = await createScheduleSlot(tx, data);
      await logAudit(tx, actor, {
        action: "schedule.created",
        entityType: "ClassRoom",
        entityId: data.classId,
        metadata: {
          className: created.name,
          weekday: data.weekday,
          startTime: data.startTime,
          endTime: data.endTime,
          room: data.room,
          effectiveFrom: data.effectiveFrom ?? null
        }
      });
      return created;
    });
    return successState(
      `Đã thêm buổi ${weekdayLabel(data.weekday)} ${data.startTime}–${data.endTime} cho lớp ${classRoom.name}.`
    );
  } catch (createError) {
    return actionFailure(createError, "Không thể thêm buổi học.");
  }
}

export async function updateScheduleAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireStaff();
  const { data, error } = safeParseForm(updateScheduleSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  try {
    await runSerializableAction(async (tx) => {
      const before = await tx.classSchedule.findUnique({
        where: { id: data.id },
        select: { classId: true, weekday: true, startTime: true, endTime: true, room: true }
      });
      await updateScheduleSlot(tx, data);
      if (before) {
        await logAudit(tx, actor, {
          action: "schedule.updated",
          entityType: "ClassRoom",
          entityId: before.classId,
          metadata: {
            scheduleId: data.id,
            from: { weekday: before.weekday, startTime: before.startTime, endTime: before.endTime, room: before.room },
            to: { weekday: data.weekday, startTime: data.startTime, endTime: data.endTime, room: data.room }
          }
        });
      }
    });
  } catch (updateError) {
    return actionFailure(updateError, "Không thể sửa lịch học.");
  }
  return successState(`Đã sửa lịch thành ${weekdayLabel(data.weekday)} ${data.startTime}–${data.endTime}.`);
}

export async function stopScheduleAction(scheduleId: string, fromDate: string): Promise<ResultState> {
  const actor = await requireStaff();
  const date = parseIsoDate(fromDate);
  if (!date) return errorState("Ngày ngừng không hợp lệ.");
  try {
    const result = await runSerializableAction(async (tx) => {
      const before = await tx.classSchedule.findUnique({
        where: { id: String(scheduleId) },
        select: { classId: true, weekday: true, startTime: true, endTime: true }
      });
      const outcome = await stopScheduleSlot(tx, { id: String(scheduleId), fromDate: date });
      if (before) {
        await logAudit(tx, actor, {
          action: outcome === "deleted" ? "schedule.deleted" : "schedule.stopped",
          entityType: "ClassRoom",
          entityId: before.classId,
          metadata: { scheduleId: String(scheduleId), ...before, fromDate: date }
        });
      }
      return outcome;
    });
    return successState(result === "deleted" ? "Đã xóa buổi học khỏi lịch." : `Đã ngừng buổi học từ ${formatIsoDayMonth(date)}.`);
  } catch (stopError) {
    return actionFailure(stopError, "Không thể ngừng buổi học.");
  }
}

export async function markSessionAction(input: {
  classId: string;
  date: string;
  startTime: string;
  status: "held" | "cancelled";
  reason?: string;
}): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const data = parseInput(markSessionSchema, input);
    const warning = await runSerializableAction(async (tx) => {
      const result = await markSession(tx, data, actor.username);
      // Điểm danh "đã học" diễn ra hằng ngày nên không ghi nhật ký; chỉ ghi buổi lớp nghỉ.
      if (data.status === "cancelled") {
        await logAudit(tx, actor, {
          action: "session.cancelled",
          entityType: "ClassRoom",
          entityId: data.classId,
          reason: data.reason,
          metadata: { date: data.date, startTime: data.startTime }
        });
      }
      return result;
    });
    return successState(
      `${data.status === "held" ? "Đã điểm danh đã học" : "Đã ghi lớp nghỉ"} buổi ${formatIsoDayMonth(data.date)} ${data.startTime}.${warning}`
    );
  } catch (markError) {
    return actionFailure(markError, "Không thể điểm danh.");
  }
}

export async function clearSessionAction(recordId: string): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    await runSerializableAction(async (tx) => {
      const before = await tx.classSession.findUnique({
        where: { id: String(recordId) },
        select: { classId: true, date: true, startTime: true, status: true, reason: true }
      });
      await clearSession(tx, String(recordId));
      // Bỏ điểm danh "đã học" là việc thường ngày; chỉ ghi khi gỡ buổi nghỉ/buổi bù.
      if (before && before.status !== "held") {
        await logAudit(tx, actor, {
          action: "session.cleared",
          entityType: "ClassRoom",
          entityId: before.classId,
          metadata: {
            date: before.date.toISOString().slice(0, 10),
            startTime: before.startTime,
            previousStatus: before.status,
            previousReason: before.reason
          }
        });
      }
    });
  } catch (clearError) {
    return actionFailure(clearError, "Không thể bỏ điểm danh.");
  }
  return successState("Đã bỏ điểm danh buổi học.");
}

export async function addMakeupSessionAction(input: {
  classId: string;
  date: string;
  startTime: string;
  endTime: string;
  room?: string;
  reason?: string;
  fromDate?: string;
  fromStartTime?: string;
}): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const data = parseInput(makeupSessionSchema, input);
    const warning = await runSerializableAction(async (tx) => {
      const result = await addMakeupSession(tx, data, actor.username);
      await logAudit(tx, actor, {
        action: "session.makeup_added",
        entityType: "ClassRoom",
        entityId: data.classId,
        reason: data.reason,
        metadata: {
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          fromDate: data.fromDate ?? null,
          fromStartTime: data.fromStartTime ?? null
        }
      });
      return result;
    });
    return successState(
      data.fromDate
        ? `Đã dời buổi ${formatIsoDayMonth(data.fromDate)} sang ${formatIsoDayMonth(data.date)} ${data.startTime}.${warning}`
        : `Đã thêm buổi học bù ${formatIsoDayMonth(data.date)} ${data.startTime}.${warning}`
    );
  } catch (makeupError) {
    return actionFailure(makeupError, "Không thể thêm buổi học bù.");
  }
}

export async function markPendingHeldAction(input: { from: string; to: string; classId?: string }): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const data = parseInput(bulkHeldSchema, input);
    const count = await runSerializableAction((tx) => markPendingSessionsHeld(tx, data, actor.username));
    return successState(count > 0 ? `Đã điểm danh đã học ${count} buổi.` : "Không còn buổi nào chưa điểm danh.");
  } catch (bulkError) {
    return actionFailure(bulkError, "Không thể điểm danh hàng loạt.");
  }
}

export async function cancelDayAction(input: { date: string; reason: string }): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const data = parseInput(cancelDaySchema, input);
    const result = await runSerializableAction(async (tx) => {
      const outcome = await cancelDay(tx, data, actor.username);
      if (outcome.count > 0) {
        await logAudit(tx, actor, {
          action: "session.day_cancelled",
          entityType: "Center",
          entityId: data.date,
          reason: data.reason,
          metadata: { date: data.date, cancelledSessions: outcome.count }
        });
      }
      return outcome;
    });
    return successState(
      result.count > 0
        ? `Đã ghi nghỉ ${result.count} buổi ngày ${formatIsoDayMonth(data.date)} (${data.reason}).${result.warning}`
        : `Ngày ${formatIsoDayMonth(data.date)} không có buổi nào theo lịch.`
    );
  } catch (cancelError) {
    return actionFailure(cancelError, "Không thể ghi nghỉ cả ngày.");
  }
}
