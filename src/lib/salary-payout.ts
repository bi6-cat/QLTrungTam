import { periodIndex } from "@/lib/enrollment-period";
import { loadSalaryLines, salaryPayoutDescription, type SalaryLine } from "@/lib/salary";
import { runSerializable } from "@/lib/serializable";

export type SalaryPayoutLine = {
  classId: string;
  month: number;
  year: number;
  amount: number;
  /** Chuyển khoản hoặc tiền mặt; mặc định chuyển khoản. */
  method?: "bank_transfer" | "cash";
};

export type SalaryPayoutResult = Array<{ line: SalaryLine; amount: number; method: "bank_transfer" | "cash" }>;

/**
 * Ghi một lần chuyển lương cho giáo viên: mỗi dòng (lớp, kỳ học phí, số tiền) thành một bản ghi
 * chi phí của CHÍNH kỳ đó. Một kỳ có thể chuyển nhiều lần (trả một phần, chuyển bù khi học sinh
 * nộp muộn); số âm dùng để trừ lại phần đã chuyển dư. Lỗi nghiệp vụ ném Error tiếng Việt.
 */
export async function recordSalaryPayout(input: {
  actor: { userId: string; username: string };
  paidAt: Date;
  note: string | null;
  lines: SalaryPayoutLine[];
  now?: Date;
}): Promise<SalaryPayoutResult> {
  const now = input.now ?? new Date();
  if (input.paidAt.getTime() > now.getTime()) throw new Error("Ngày chuyển tiền không được ở tương lai.");
  if (input.lines.length === 0) throw new Error("Chọn ít nhất một lớp để ghi.");

  const currentIndex = periodIndex(now.getMonth() + 1, now.getFullYear());
  const periods = new Map<string, SalaryPayoutLine[]>();
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (line.amount === 0) throw new Error("Số tiền chuyển phải khác 0.");
    if (periodIndex(line.month, line.year) > currentIndex) {
      throw new Error(`Chưa tới kỳ T${line.month}/${line.year}, chưa ghi lương được.`);
    }
    const key = `${line.classId}:${line.year}:${line.month}:${line.method ?? "bank_transfer"}`;
    if (seen.has(key)) {
      throw new Error("Mỗi lớp, mỗi tháng chỉ ghi một dòng chuyển khoản và một dòng tiền mặt trong cùng lần ghi.");
    }
    seen.add(key);
    const periodKey = `${line.year}-${line.month}`;
    periods.set(periodKey, [...(periods.get(periodKey) ?? []), line]);
  }

  return runSerializable(
    async (tx) => {
      const results: SalaryPayoutResult = [];
      for (const lines of periods.values()) {
        const { month, year } = lines[0];
        const salaryLines = await loadSalaryLines(month, year, {
          db: tx,
          classIds: lines.map((line) => line.classId)
        });
        for (const payout of lines) {
          const method = payout.method ?? "bank_transfer";
          const line = salaryLines.find((item) => item.classId === payout.classId);
          if (!line) throw new Error(`Không tìm thấy lớp cần ghi lương kỳ T${month}/${year}. Vui lòng tải lại trang.`);
          if (line.mode === "manual") {
            throw new Error(
              `${line.className} kỳ T${month}/${year} có khoản lương nhập tay cũ, không ghi chuyển theo % được. Xóa khoản đó ở Thu chi rồi ghi lại.`
            );
          }
          const expense = await tx.expense.create({
            data: {
              month,
              year,
              category: "teacher_salary",
              classId: line.classId,
              description: salaryPayoutDescription(line, payout.amount, method),
              amount: payout.amount,
              paymentMethod: method,
              sharePercent: line.sharePercent,
              baseAmount: line.collected,
              paidAt: input.paidAt,
              note: input.note
            },
            select: { id: true }
          });
          await tx.auditLog.create({
            data: {
              actorUserId: input.actor.userId,
              actorUsername: input.actor.username.trim(),
              action: "salary.paid",
              entityType: "Expense",
              entityId: expense.id,
              metadata: {
                classId: line.classId,
                month,
                year,
                amount: payout.amount,
                method,
                paidAt: input.paidAt.toISOString(),
                sharePercent: line.sharePercent,
                collected: line.collected,
                due: line.due,
                previouslyPaid: line.paidOut
              }
            }
          });
          results.push({ line, amount: payout.amount, method });
        }
      }
      return results;
    },
    { onConflict: () => new Error("Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.") }
  );
}
