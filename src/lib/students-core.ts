import type { z } from "zod";
import { logAudit, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import type { createStudentSchema } from "@/lib/validation";

export type CreateStudentInput = z.infer<typeof createStudentSchema>;
export type CreateStudentResult =
  | { ok: true; studentId: string; fullName: string; warning: string }
  | { ok: false; error: string };

/**
 * Logic thêm học sinh dùng chung cho form admin và MCP (Claude); ghi nhật ký cùng transaction.
 *
 * - Trùng cả tên lẫn SĐT  -> chặn hẳn (gần như chắc chắn là nhập lặp).
 * - Trùng ở hồ sơ đã lưu trữ -> chặn, hướng dẫn khôi phục thay vì tạo bản sao.
 * - Chỉ trùng SĐT (khác tên) -> vẫn tạo, kèm cảnh báo vì anh chị em dùng chung
 *   số phụ huynh là bình thường, nhưng cùng lớp thì memo sẽ đụng nhau.
 */
export async function createStudentRecord(
  data: CreateStudentInput,
  actor: AuditActor,
  extraMetadata: Record<string, string> = {}
): Promise<CreateStudentResult> {
  return prisma.$transaction(async (tx) => {
    const samePhone = await tx.student.findMany({
      where: { phone: data.phone },
      select: { id: true, fullName: true, archivedAt: true },
      take: 20
    });

    const normalized = data.fullName.toLocaleLowerCase("vi");
    const duplicate = samePhone.find((student) => student.fullName.toLocaleLowerCase("vi") === normalized);
    if (duplicate) {
      return {
        ok: false as const,
        error: duplicate.archivedAt
          ? `"${duplicate.fullName}" (${data.phone}) đã có trong hồ sơ lưu trữ. Hãy khôi phục hồ sơ đó thay vì tạo mới.`
          : `"${duplicate.fullName}" (${data.phone}) đã tồn tại. Không tạo thêm hồ sơ trùng.`
      };
    }

    const created = await tx.student.create({
      data: {
        fullName: data.fullName,
        phone: data.phone,
        address: data.address,
        parentName: data.parentName,
        note: data.note
      },
      select: { id: true, fullName: true }
    });
    await logAudit(tx, actor, {
      action: "student.created",
      entityType: "Student",
      entityId: created.id,
      metadata: { fullName: created.fullName, phone: data.phone, ...extraMetadata }
    });

    const activeSiblings = samePhone.filter((student) => !student.archivedAt);
    return {
      ok: true as const,
      studentId: created.id,
      fullName: created.fullName,
      warning:
        activeSiblings.length > 0
          ? `SĐT ${data.phone} đang dùng cho ${activeSiblings
              .map((student) => student.fullName)
              .join(", ")}. Nếu là anh chị em thì bình thường, nhưng tránh xếp chung một lớp vì nội dung chuyển khoản sẽ trùng nhau.`
          : ""
    };
  });
}
