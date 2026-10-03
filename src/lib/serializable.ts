import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export function isKnownPrismaError(error: unknown, code: string) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

/**
 * Chạy một Prisma transaction mức Serializable, tự thử lại khi Postgres báo xung đột ghi
 * (P2034). Hết lượt thử thì ném lỗi do nơi gọi chọn; tùy chọn đổi lỗi trùng unique (P2002)
 * thành lỗi nghiệp vụ. Mọi lỗi khác được ném nguyên vẹn.
 */
export async function runSerializable<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
  options: {
    onConflict: () => Error;
    onUniqueViolation?: () => Error;
  }
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (isKnownPrismaError(error, "P2034")) {
        if (attempt < MAX_SERIALIZABLE_ATTEMPTS) continue;
        throw options.onConflict();
      }
      if (options.onUniqueViolation && isKnownPrismaError(error, "P2002")) {
        throw options.onUniqueViolation();
      }
      throw error;
    }
  }
}
