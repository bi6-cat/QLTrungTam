// Không import next/headers hay prisma ở đây: file này dùng chung cho middleware.

export type AdminRole = "owner" | "manager";

export const ROLE_LABEL: Record<AdminRole, string> = {
  owner: "Chủ trung tâm",
  manager: "Quản lý phụ"
};

/**
 * Các trang /admin quản lý phụ được mở (kèm trang con). Quyền thao tác trong từng trang
 * (chỉ xem, chỉ nhập số buổi…) do trang và server action tự kiểm tra.
 */
const MANAGER_PATHS = [
  "/admin/class-sessions",
  "/admin/debts",
  "/admin/transactions",
  "/admin/reports",
  "/admin/settings"
];

export function canAccessAdminPath(role: AdminRole, pathname: string) {
  if (role === "owner") return true;
  if (pathname === "/admin" || pathname === "/admin/") return true;
  return MANAGER_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Token cũ (trước khi có vai trò) chỉ có thể là của chủ trung tâm. */
export function parseRole(value: unknown): AdminRole {
  return value === "manager" ? "manager" : "owner";
}
