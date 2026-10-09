"use server";

import { revalidatePath } from "next/cache";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireAdmin } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import {
  createManagerSchema,
  deleteManagerSchema,
  resetManagerPasswordSchema,
  safeParseForm
} from "@/lib/validation";

// Chỉ chủ trung tâm quản lý tài khoản quản lý phụ. Mọi thao tác chỉ chạm tài khoản role=manager
// để không thể sửa/xóa tài khoản chủ qua các action này.

export async function createManagerAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(createManagerSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const existing = await prisma.adminUser.findUnique({ where: { username: data.username }, select: { id: true } });
  if (existing) return errorState(`Tên đăng nhập "${data.username}" đã được dùng.`);

  try {
    const user = await prisma.adminUser.create({
      data: { username: data.username, passwordHash: hashPassword(data.password), role: "manager" }
    });
    await prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorUsername: actor.username.trim(),
        action: "admin_user.created",
        entityType: "AdminUser",
        entityId: user.id,
        metadata: { username: user.username, role: "manager" }
      }
    });
  } catch (createError) {
    console.error("Không tạo được tài khoản quản lý phụ.", createError);
    return errorState("Không tạo được tài khoản. Tên đăng nhập có thể vừa được dùng, vui lòng thử lại.");
  }

  revalidatePath("/admin/settings");
  return successState(`Đã tạo tài khoản quản lý phụ "${data.username}".`);
}

export async function resetManagerPasswordAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(resetManagerPasswordSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  const updated = await prisma.adminUser.updateMany({
    where: { id: data.userId, role: "manager" },
    data: { passwordHash: hashPassword(data.password) }
  });
  if (updated.count !== 1) return errorState("Không tìm thấy tài khoản quản lý phụ.");

  await prisma.auditLog.create({
    data: {
      actorUserId: actor.userId,
      actorUsername: actor.username.trim(),
      action: "admin_user.password_reset",
      entityType: "AdminUser",
      entityId: data.userId
    }
  });
  return successState("Đã đặt lại mật khẩu.");
}

export async function deleteManagerAction(userId: string): Promise<ResultState> {
  const actor = await requireAdmin();
  const parsed = deleteManagerSchema.safeParse({ userId });
  if (!parsed.success) return errorState("Tài khoản không hợp lệ.");
  const data = parsed.data;

  const user = await prisma.adminUser.findFirst({
    where: { id: data.userId, role: "manager" },
    select: { id: true, username: true }
  });
  if (!user) return errorState("Không tìm thấy tài khoản quản lý phụ.");

  // Nhật ký cũ giữ actorUsername; actorUserId tự về null (onDelete: SetNull).
  await prisma.$transaction([
    prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorUsername: actor.username.trim(),
        action: "admin_user.deleted",
        entityType: "AdminUser",
        entityId: user.id,
        metadata: { username: user.username }
      }
    }),
    prisma.adminUser.delete({ where: { id: user.id } })
  ]);

  revalidatePath("/admin/settings");
  return successState(`Đã xóa tài khoản "${user.username}". Phiên đăng nhập của tài khoản này hết hiệu lực ngay.`);
}
