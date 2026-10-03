import { NextResponse, type NextRequest } from "next/server";
import { decodeSessionToken, SESSION_COOKIE_NAME } from "@/lib/session-token";

/**
 * Chặn sớm mọi request vào /admin khi cookie phiên không hợp lệ, kể cả request RSC
 * khi chuyển trang. Đây là lớp chặn thêm; mỗi trang vẫn tự gọi requireAdmin().
 */
export function middleware(request: NextRequest) {
  let session = null;
  try {
    session = decodeSessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  } catch {
    // Thiếu SESSION_SECRET trên production: coi như chưa đăng nhập.
    session = null;
  }
  if (session) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/admin/:path*"],
  runtime: "nodejs"
};
