"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { successState, errorState, type ResultState } from "@/lib/action-states";
import { actionFailure, runSerializableAction } from "@/lib/actions/shared";
import { requireAdmin, requireStaff } from "@/lib/auth";
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
import { prisma } from "@/lib/prisma";
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

// Lịch cố định: chỉ chủ trung tâm. Điểm danh (đã học / lớp nghỉ / học bù): chủ và quản lý phụ.

function revalidateSchedulePaths() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/finance");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

function parseInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error(result.error.issues.map((issue) => issue.message).join("; "));
  return result.data;
}

export async function createScheduleAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createScheduleSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  try {
    const classRoom = await runSerializableAction((tx) => createScheduleSlot(tx, data));
    revalidateSchedulePaths();
    return successState(
      `Đã thêm buổi ${weekdayLabel(data.weekday)} ${data.startTime}–${data.endTime} cho lớp ${classRoom.name}.`
    );
  } catch (createError) {
    return actionFailure(createError, "Không thể thêm buổi học.");
  }
}

export async function updateScheduleAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateScheduleSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  try {
    await runSerializableAction((tx) => updateScheduleSlot(tx, data));
  } catch (updateError) {
    return actionFailure(updateError, "Không thể sửa lịch học.");
  }
  revalidateSchedulePaths();
  return successState(`Đã sửa lịch thành ${weekdayLabel(data.weekday)} ${data.startTime}–${data.endTime}.`);
}

export async function stopScheduleAction(scheduleId: string, fromDate: string): Promise<ResultState> {
  await requireAdmin();
  const date = parseIsoDate(fromDate);
  if (!date) return errorState("Ngày ngừng không hợp lệ.");
  try {
    const result = await stopScheduleSlot(prisma, { id: String(scheduleId), fromDate: date });
    revalidateSchedulePaths();
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
    const warning = await runSerializableAction((tx) => markSession(tx, data, actor.username));
    revalidateSchedulePaths();
    return successState(
      `${data.status === "held" ? "Đã điểm danh đã học" : "Đã ghi lớp nghỉ"} buổi ${formatIsoDayMonth(data.date)} ${data.startTime}.${warning}`
    );
  } catch (markError) {
    return actionFailure(markError, "Không thể điểm danh.");
  }
}

export async function clearSessionAction(recordId: string): Promise<ResultState> {
  await requireStaff();
  try {
    await clearSession(prisma, String(recordId));
  } catch (clearError) {
    return actionFailure(clearError, "Không thể bỏ điểm danh.");
  }
  revalidateSchedulePaths();
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
    const warning = await runSerializableAction((tx) => addMakeupSession(tx, data, actor.username));
    revalidateSchedulePaths();
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
    revalidateSchedulePaths();
    return successState(count > 0 ? `Đã điểm danh đã học ${count} buổi.` : "Không còn buổi nào chưa điểm danh.");
  } catch (bulkError) {
    return actionFailure(bulkError, "Không thể điểm danh hàng loạt.");
  }
}

export async function cancelDayAction(input: { date: string; reason: string }): Promise<ResultState> {
  const actor = await requireStaff();
  try {
    const data = parseInput(cancelDaySchema, input);
    const result = await runSerializableAction((tx) => cancelDay(tx, data, actor.username));
    revalidateSchedulePaths();
    return successState(
      result.count > 0
        ? `Đã ghi nghỉ ${result.count} buổi ngày ${formatIsoDayMonth(data.date)} (${data.reason}).${result.warning}`
        : `Ngày ${formatIsoDayMonth(data.date)} không có buổi nào theo lịch.`
    );
  } catch (cancelError) {
    return actionFailure(cancelError, "Không thể ghi nghỉ cả ngày.");
  }
}
