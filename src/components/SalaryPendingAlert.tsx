import Link from "next/link";
import { AlertTriangle, Send } from "lucide-react";
import { formatCurrency } from "@/lib/format";

/** Nhắc các kỳ trước chưa chuyển đủ lương giáo viên, dẫn sang trang Lương GV. */
export function SalaryPendingAlert({ count, amount }: { count: number; amount: number }) {
  if (count === 0) return null;
  return (
    <Link
      href="/admin/salary"
      className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-900 hover:border-amber-300"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
      <span className="flex-1">
        {count} lớp-kỳ trước chưa chuyển đủ lương giáo viên, tổng <strong>{formatCurrency(amount)}</strong> (thường do
        học sinh nộp muộn sau khi đã chuyển lương).
      </span>
      <span className="inline-flex items-center gap-1 font-semibold text-primary">
        <Send className="h-4 w-4" /> Mở Lương GV
      </span>
    </Link>
  );
}
