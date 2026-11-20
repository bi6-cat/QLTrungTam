import type { Prisma } from "@prisma/client";

/** Người thực hiện: tài khoản admin/quản lý, hoặc hệ thống (webhook, MCP) với userId null. */
export type AuditActor = { userId: string | null; username: string };

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  /** Bỏ trống thì tự suy ra từ entityType/entityId (ghi danh, hóa đơn, giao dịch có invoiceId). */
  classId?: string | null;
  studentId?: string | null;
};

type AuditDb = Pick<Prisma.TransactionClient, "auditLog" | "enrollment" | "monthlyInvoice">;

function invoiceIdOf(metadata: Prisma.InputJsonValue | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).invoiceId;
  return typeof value === "string" && value ? value : null;
}

/** Lớp/học sinh liên quan của một log, để trang Nhật ký lọc được theo lớp hoặc học sinh. */
async function resolveScope(db: AuditDb, entry: AuditEntry) {
  let classId = entry.classId ?? null;
  let studentId = entry.studentId ?? null;
  if (classId && studentId) return { classId, studentId };

  if (entry.entityType === "ClassRoom") classId ??= entry.entityId;
  if (entry.entityType === "Student") studentId ??= entry.entityId;

  let enrollment: { classId: string; studentId: string } | null = null;
  if (entry.entityType === "Enrollment") {
    enrollment = await db.enrollment.findUnique({
      where: { id: entry.entityId },
      select: { classId: true, studentId: true }
    });
  } else {
    const invoiceId =
      entry.entityType === "MonthlyInvoice" ? entry.entityId : entry.entityType === "Transaction" ? invoiceIdOf(entry.metadata) : null;
    if (invoiceId) {
      const invoice = await db.monthlyInvoice.findUnique({
        where: { id: invoiceId },
        select: { enrollment: { select: { classId: true, studentId: true } } }
      });
      enrollment = invoice?.enrollment ?? null;
    }
  }
  if (enrollment) {
    classId ??= enrollment.classId;
    studentId ??= enrollment.studentId;
  }
  return { classId, studentId };
}

/**
 * Ghi một dòng nhật ký thay đổi. Gọi bằng `tx` của transaction đang ghi dữ liệu để log và thay
 * đổi cùng thành công hoặc cùng hủy. Metadata nên có giá trị trước/sau: { field: { from, to } }.
 */
export async function logAudit(db: AuditDb, actor: AuditActor, entry: AuditEntry) {
  const scope = await resolveScope(db, entry);
  await db.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorUsername: actor.username.trim(),
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      reason: entry.reason ?? null,
      metadata: entry.metadata,
      classId: scope.classId,
      studentId: scope.studentId
    }
  });
}

type Scalar = string | number | boolean | null;

/** Các trường đã đổi giữa hai bản ghi: { field: { from, to } }; rỗng nếu không đổi gì. */
export function diffFields<T extends Record<string, Scalar | undefined>>(before: T, after: Partial<T>) {
  const changes: Record<string, { from: Scalar; to: Scalar }> = {};
  for (const key of Object.keys(after)) {
    const from = before[key] ?? null;
    const to = after[key] ?? null;
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}
