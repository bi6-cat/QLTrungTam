import type { Prisma } from "@prisma/client";
import { logAudit, type AuditActor } from "@/lib/audit";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

export type EnrollStudentInput = {
  studentId: string;
  classId: string;
  sessionsOverride: number | null;
  status: "active" | "on_leave";
  startDate: Date;
};

/**
 * Thêm một học sinh vào lớp kèm ngày vào lớp; dùng chung cho form admin và MCP (Claude).
 * Phải chạy trong transaction serializable (runSerializableAction).
 *
 * Học sinh từng nghỉ lớp này quay lại: dùng lại ghi danh cũ, đặt ngày bắt đầu mới và xóa
 * mốc nghỉ. Các tháng đã nghỉ (không có kế hoạch/hóa đơn) không "sống lại" vì đều trước
 * ngày bắt đầu mới; các tháng đã học trước đó vẫn hiện nhờ dữ liệu hóa đơn của chúng.
 */
export async function enrollStudentInClass(tx: Prisma.TransactionClient, data: EnrollStudentInput, actor: AuditActor) {
  const { startDate } = data;
  const [student, classRoom, existing] = await Promise.all([
    tx.student.findUnique({ where: { id: data.studentId }, select: { fullName: true, archivedAt: true } }),
    tx.classRoom.findUnique({ where: { id: data.classId }, select: { name: true, archivedAt: true } }),
    tx.enrollment.findUnique({
      where: { studentId_classId: { studentId: data.studentId, classId: data.classId } },
      select: { id: true, startDate: true, leftAt: true }
    })
  ]);

  if (!student) throw new Error("Không tìm thấy học sinh.");
  if (!classRoom) throw new Error("Không tìm thấy lớp học.");
  if (student.archivedAt) throw new Error("Không thể ghi danh học sinh đã lưu trữ.");
  if (classRoom.archivedAt) throw new Error("Không thể ghi danh vào lớp đã lưu trữ.");

  const scope = { classId: data.classId, studentId: data.studentId };

  if (!existing) {
    const created = await tx.enrollment.create({
      data: {
        studentId: data.studentId,
        classId: data.classId,
        sessionsOverride: data.sessionsOverride,
        status: data.status,
        startDate
      },
      select: { id: true }
    });
    await logAudit(tx, actor, {
      action: "enrollment.created",
      entityType: "Enrollment",
      entityId: created.id,
      ...scope,
      metadata: {
        className: classRoom.name,
        studentName: student.fullName,
        startDate: startDate.toISOString(),
        sessionsOverride: data.sessionsOverride,
        status: data.status
      }
    });
    return { studentName: student.fullName, className: classRoom.name, rejoined: false };
  }

  if (!existing.leftAt) {
    throw new Error(`${student.fullName} đã có trong lớp (bắt đầu học ${dateFormatter.format(existing.startDate)}).`);
  }

  await tx.enrollment.update({
    where: { id: existing.id },
    data: { sessionsOverride: data.sessionsOverride, status: data.status, leftAt: null, startDate }
  });
  await logAudit(tx, actor, {
    action: "enrollment.rejoined",
    entityType: "Enrollment",
    entityId: existing.id,
    ...scope,
    metadata: {
      className: classRoom.name,
      studentName: student.fullName,
      previousStartDate: existing.startDate.toISOString(),
      previousLeftAt: existing.leftAt.toISOString(),
      startDate: startDate.toISOString()
    }
  });
  return { studentName: student.fullName, className: classRoom.name, rejoined: true };
}
