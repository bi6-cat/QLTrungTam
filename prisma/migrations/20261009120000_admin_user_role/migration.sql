-- Vai trò tài khoản quản trị: tài khoản có sẵn là chủ trung tâm (owner), quản lý phụ là manager.
CREATE TYPE "AdminRole" AS ENUM ('owner', 'manager');

ALTER TABLE "AdminUser" ADD COLUMN "role" "AdminRole" NOT NULL DEFAULT 'owner';
