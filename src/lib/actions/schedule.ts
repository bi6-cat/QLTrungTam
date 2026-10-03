"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { weekdayLabel } from "@/lib/schedule";
import { createScheduleSchema, safeParseForm } from "@/lib/validation";

function revalidateSchedulePaths() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/finance");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

export async function createScheduleAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createScheduleSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  if (data.endTime <= data.startTime) return errorState("Giờ kết thúc phải sau giờ bắt đầu.");

  const classRoom = await prisma.classRoom.findUnique({
    where: { id: data.classId },
    select: { archivedAt: true, name: true }
  });
  if (!classRoom) return errorState("Không tìm thấy lớp học.");
  if (classRoom.archivedAt) return errorState("Không thể xếp lịch cho lớp đã lưu trữ.");

  try {
    await prisma.classSchedule.create({
      data: {
        classId: data.classId,
        weekday: data.weekday,
        startTime: data.startTime,
        endTime: data.endTime,
        room: data.room,
        note: data.note
      }
    });
  } catch (createError) {
    if (createError instanceof Prisma.PrismaClientKnownRequestError && createError.code === "P2002") {
      return errorState("Lớp này đã có buổi học trùng thứ và giờ bắt đầu.");
    }
    throw createError;
  }

  revalidateSchedulePaths();
  return successState(
    `Đã thêm buổi ${weekdayLabel(data.weekday)} ${data.startTime}–${data.endTime} cho lớp ${classRoom.name}.`
  );
}

export async function deleteScheduleAction(scheduleId: string): Promise<ResultState> {
  await requireAdmin();
  const deleted = await prisma.classSchedule.deleteMany({ where: { id: String(scheduleId) } });
  if (deleted.count !== 1) return errorState("Buổi học không còn tồn tại. Vui lòng tải lại trang.");
  revalidateSchedulePaths();
  return successState("Đã xóa buổi học.");
}
