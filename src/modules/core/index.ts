// Cửa chung của các module tới hạ tầng còn nằm trong src/lib. Chỉ module core được import
// "@/lib/*"; module khác (identity, learning…) lấy những thứ này qua "@/modules/core".
export { prisma } from "@/lib/prisma";
export { hashPassword, verifyPassword } from "@/lib/password";
