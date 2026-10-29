import { NextResponse, type NextRequest } from "next/server";
import { decodePortalToken, PORTAL_COOKIE, PORTAL_LOGIN, portalForPath } from "@/modules/identity";
import { canAccessAdminPath, parseRole } from "@/lib/roles";
import { decodeSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

/**
 * Chặn sớm mọi request vào /admin, /teacher, /learn khi cookie phiên của khu đó không hợp lệ,
 * kể cả request RSC khi chuyển trang, và đưa quản lý phụ khỏi trang admin không được phép về
 * Tổng quan. Mỗi khu chỉ đọc cookie của mình. Đây là lớp chặn thêm; mỗi trang vẫn tự gọi
 * requireAdmin()/requireStaff()/requireTeacher()/requireStudent() (đọc lại từ DB).
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const portal = portalForPath(pathname);
  if (portal) {
    if (!safeDecode(() => decodePortalToken(portal, request.cookies.get(PORTAL_COOKIE[portal])?.value))) {
      return NextResponse.redirect(new URL(PORTAL_LOGIN[portal], request.url));
    }
    return NextResponse.next();
  }
  if (!pathname.startsWith("/admin")) return NextResponse.next();

  const session = safeDecode(() => decodeSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value));
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!canAccessAdminPath(parseRole(session.role), pathname)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return NextResponse.next();
}

/** Thiếu SESSION_SECRET trên production: coi như chưa đăng nhập. */
function safeDecode<T>(decode: () => T | null) {
  try {
    return decode();
  } catch {
    return null;
  }
}

export const config = {
  matcher: ["/admin/:path*", "/teacher/:path*", "/learn/:path*"],
  runtime: "nodejs"
};
