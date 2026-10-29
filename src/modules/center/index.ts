import { prisma } from "@/modules/core";

// Phần đọc lớp/ghi danh cho các cổng mới. Code quản lý lớp cũ vẫn ở src/lib, chuyển dần sang đây.

export type PortalClass = { id: string; name: string; shortCode: string; teacherName: string };

export async function listClassesForTeacher(teacherId: string): Promise<PortalClass[]> {
  return prisma.classRoom.findMany({
    where: { teacherId, archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, shortCode: true, teacherName: true }
  });
}

/**
 * Lớp học sinh đang theo học: chưa rời lớp (leftAt trống hoặc ở tương lai) và lớp chưa lưu trữ.
 * Bảo lưu (on_leave) vẫn tính là của lớp, để khi quay lại không mất bài và tài liệu.
 */
export async function listClassesForStudent(studentId: string, now = new Date()) {
  const enrollments = await prisma.enrollment.findMany({
    where: {
      studentId,
      OR: [{ leftAt: null }, { leftAt: { gt: now } }],
      classRoom: { archivedAt: null }
    },
    orderBy: { classRoom: { name: "asc" } },
    select: { status: true, classRoom: { select: { id: true, name: true, shortCode: true, teacherName: true } } }
  });
  return enrollments.map((e) => ({ ...e.classRoom, onLeave: e.status === "on_leave" }));
}
