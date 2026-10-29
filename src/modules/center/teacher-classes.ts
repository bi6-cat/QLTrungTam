import { prisma } from "@/modules/core";

/** Khoá so khớp tên giáo viên: bỏ khác biệt hoa/thường, khoảng trắng thừa và cách gõ dấu (NFC). */
export function teacherNameKey(name: string) {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
}

/** Lớp chưa lưu trữ, kèm giáo viên đang được gán (để màn hình gán lớp hiện ai đang dạy). */
export async function listAssignableClasses() {
  return prisma.classRoom.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, shortCode: true, teacherName: true, teacherId: true }
  });
}

/**
 * Gán cho giáo viên các lớp chưa có tài khoản giáo viên mà teacherName khớp tên này. Không lấy
 * lớp đã gán cho người khác. Trả về id các lớp vừa gán.
 */
export async function assignClassesByTeacherName(teacherId: string, fullName: string) {
  const key = teacherNameKey(fullName);
  if (!key) return [];
  const candidates = await prisma.classRoom.findMany({
    where: { teacherId: null, archivedAt: null },
    select: { id: true, teacherName: true }
  });
  const ids = candidates.filter((c) => teacherNameKey(c.teacherName) === key).map((c) => c.id);
  if (ids.length > 0) {
    await prisma.classRoom.updateMany({ where: { id: { in: ids }, teacherId: null }, data: { teacherId } });
  }
  return ids;
}

/**
 * Đặt đúng danh sách lớp của giáo viên: lớp trong danh sách chuyển sang giáo viên này (kể cả
 * đang gán người khác), lớp đang gán mà không còn trong danh sách thì bỏ gán. Chỉ đổi teacherId;
 * teacherName (dùng cho lương, báo cáo) giữ nguyên.
 */
export async function setTeacherClasses(teacherId: string, classIds: readonly string[]) {
  const ids = [...new Set(classIds)];
  return prisma.$transaction(async (tx) => {
    const unassigned = await tx.classRoom.updateMany({
      where: { teacherId, id: { notIn: ids } },
      data: { teacherId: null }
    });
    const assigned = ids.length
      ? await tx.classRoom.updateMany({ where: { id: { in: ids }, archivedAt: null }, data: { teacherId } })
      : { count: 0 };
    return { assigned: assigned.count, unassigned: unassigned.count };
  });
}
