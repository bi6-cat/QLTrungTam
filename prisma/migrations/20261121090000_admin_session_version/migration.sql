-- Tăng khi đổi/đặt lại mật khẩu: mọi phiên đăng nhập cũ của tài khoản đó hết hiệu lực.
ALTER TABLE "AdminUser" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
