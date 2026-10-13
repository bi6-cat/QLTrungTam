import type { Prisma } from "@prisma/client";
import { errorState, type ResultState } from "@/lib/action-states";
import { InvoiceLifecycleError } from "@/lib/invoice-lifecycle";
import { LedgerError } from "@/lib/ledger";
import { runSerializable } from "@/lib/serializable";

// Helper dùng chung cho các module server action (file này không có "use server").

export function runSerializableAction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>) {
  return runSerializable(work, {
    onConflict: () => new Error("Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.")
  });
}

/**
 * Lỗi nghiệp vụ (Error thường, LedgerError, InvoiceLifecycleError — thông báo tiếng Việt) trả
 * nguyên văn cho người dùng; lỗi Prisma/hạ tầng thì ghi log và ẩn chi tiết.
 */
export function actionFailure(error: unknown, fallback: string): ResultState {
  if (
    error instanceof LedgerError ||
    error instanceof InvoiceLifecycleError ||
    (error instanceof Error && !error.name.startsWith("PrismaClient"))
  ) {
    return errorState(error.message);
  }
  console.error(fallback, error);
  return errorState(`${fallback} Vui lòng tải lại trang và thử lại.`);
}

// Action không gọi revalidatePath: kèm cây RSC của trang trong response làm transition của
// action (nút "Đang lưu...") treo mãi khi các <Link> đã prefetch xong, dù dữ liệu đã lưu.
// Mọi trang đều force-dynamic, không có data cache, nên client chỉ cần router.refresh() sau
// khi nút hết pending: xem useResultToast và useRefreshWhenIdle.

/** Chuỗi "YYYY-MM-DD" (ô input type=date) → Date lúc 0h theo giờ máy chủ (Asia/Ho_Chi_Minh). */
export function parseDateInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  if (year < 2000 || year > 2100) return null;
  return date;
}
