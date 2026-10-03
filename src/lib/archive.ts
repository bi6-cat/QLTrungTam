import { runSerializableAction } from "@/lib/actions/shared";
import { idSchema, parseForm } from "@/lib/validation";

type ArchiveEntity = "class" | "student";
type ArchiveMode = "archive" | "restore";

export function parseArchiveInput(formData: FormData) {
  const { id } = parseForm(idSchema, formData);
  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 500) {
    throw new Error("Lý do phải có từ 1 đến 500 ký tự.");
  }
  return { id, reason };
}

/** Lưu trữ/khôi phục lớp hoặc học sinh: không xóa dữ liệu, ghi audit kèm lý do. */
export async function changeArchiveState(input: {
  entity: ArchiveEntity;
  mode: ArchiveMode;
  id: string;
  reason: string;
  actor: { userId: string; username: string };
}) {
  return runSerializableAction(async (tx) => {
    const current =
      input.entity === "class"
        ? await tx.classRoom.findUnique({
            where: { id: input.id },
            select: { id: true, archivedAt: true }
          })
        : await tx.student.findUnique({
            where: { id: input.id },
            select: { id: true, archivedAt: true }
          });

    const entityLabel = input.entity === "class" ? "lớp học" : "học sinh";
    const EntityLabel = input.entity === "class" ? "Lớp học" : "Học sinh";
    if (!current) throw new Error(`Không tìm thấy ${entityLabel}.`);
    if (input.mode === "archive" && current.archivedAt) {
      throw new Error(`${EntityLabel} đã được lưu trữ.`);
    }
    if (input.mode === "restore" && !current.archivedAt) {
      throw new Error(`${EntityLabel} đang hoạt động.`);
    }

    const nextArchivedAt = input.mode === "archive" ? new Date() : null;
    const changed =
      input.entity === "class"
        ? await tx.classRoom.updateMany({
            where: { id: current.id, archivedAt: current.archivedAt },
            data: { archivedAt: nextArchivedAt }
          })
        : await tx.student.updateMany({
            where: { id: current.id, archivedAt: current.archivedAt },
            data: { archivedAt: nextArchivedAt }
          });

    if (changed.count !== 1) {
      throw new Error(`${EntityLabel} vừa được thay đổi. Vui lòng tải lại.`);
    }

    await tx.auditLog.create({
      data: {
        actorUserId: input.actor.userId,
        actorUsername: input.actor.username.trim(),
        action: `${input.entity}.${input.mode === "archive" ? "archived" : "restored"}`,
        entityType: input.entity === "class" ? "ClassRoom" : "Student",
        entityId: current.id,
        reason: input.reason,
        metadata: {
          previousArchivedAt: current.archivedAt?.toISOString() ?? null,
          archivedAt: nextArchivedAt?.toISOString() ?? null
        }
      }
    });

    return { archivedAt: nextArchivedAt };
  });
}
