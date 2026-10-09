import { NextResponse, type NextRequest } from "next/server";
import { canAccessAdminPath, parseRole } from "@/lib/roles";
import { decodeSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

/**
 * Chặn sớm mọi request vào /admin khi cookie phiên không hợp lệ, kể cả request RSC
 * khi chuyển trang, và đưa quản lý phụ khỏi trang không được phép về Tổng quan.
 * Đây là lớp chặn thêm; mỗi trang vẫn tự gọi requireAdmin()/requireStaff() (đọc vai trò từ DB).
 */
export function middleware(request: NextRequest) {
  let session = null;
  try {
    session = decodeSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  } catch {
    // Thiếu SESSION_SECRET trên production: coi như chưa đăng nhập.
    session = null;
  }
  if (!session) return NextResponse.redirect(new URL("/login", request.url));
  if (!canAccessAdminPath(parseRole(session.role), request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
  runtime: "nodejs"
};
