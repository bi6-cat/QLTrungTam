import type { PortalKind } from "./portal-token";

// Link theo dõi lớp cũ của giáo viên (/teacher/classes/<MÃ LỚP>-<mã>) mở bằng mã trong link, không
// cần đăng nhập. Trang mới của cổng giáo viên vì thế không đặt dưới /teacher/classes/.
const LEGACY_TEACHER_LINK = /^\/teacher\/classes\/[^/]+\/?$/;

/** Cổng cần đăng nhập của đường dẫn (middleware dùng để chặn sớm); null = không thuộc cổng nào. */
export function portalForPath(pathname: string): PortalKind | null {
  if (pathname === "/learn" || pathname.startsWith("/learn/")) return "student";
  if (pathname === "/teacher" || pathname.startsWith("/teacher/")) {
    return LEGACY_TEACHER_LINK.test(pathname) ? null : "teacher";
  }
  return null;
}

export const PORTAL_HOME: Record<PortalKind, string> = { teacher: "/teacher", student: "/learn" };
export const PORTAL_LOGIN: Record<PortalKind, string> = { teacher: "/login", student: "/login?as=student" };
