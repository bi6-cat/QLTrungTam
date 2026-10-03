"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure, parseDateInput, revalidateFinancialPaths } from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { recordSalaryPayout } from "@/lib/salary-payout";
import { expenseCategoryLabel } from "@/lib/schedule";
import { periodIndex } from "@/lib/enrollment-period";
import { formatDayMonth } from "@/lib/format";
import { expenseSchema, safeParseForm, salaryMonthCutoffSchema, salaryPayoutSchema } from "@/lib/validation";

export async function createExpenseAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(expenseSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  // Lương theo lớp chỉ ghi ở trang Lương GV để luôn đối chiếu được với học phí đã thu của kỳ.
  if (data.category === "teacher_salary" && data.classId) {
    return errorState(
      'Lương giáo viên theo lớp ghi ở trang "Lương GV". Khoản lương nhập tay ở đây chỉ dùng cho chi phí chung (không gắn lớp).'
    );
  }

  if (data.classId) {
    const exists = await prisma.classRoom.findUnique({ where: { id: data.classId }, select: { id: true } });
    if (!exists) return errorState("Không tìm thấy lớp học đã chọn.");
  }

  await prisma.expense.create({
    data: {
      month: data.month,
      year: data.year,
      category: data.category,
      classId: data.classId,
      description: data.description,
      amount: data.amount,
      note: data.note
    }
  });

  revalidateFinancialPaths();
  return successState(`Đã thêm chi phí ${expenseCategoryLabel(data.category).toLowerCase()} ${formatCurrency(data.amount)}.`);
}

export async function deleteExpenseAction(expenseId: string): Promise<ResultState> {
  const actor = await requireAdmin();
  const expense = await prisma.expense.findUnique({
    where: { id: String(expenseId) },
    select: { id: true, category: true, amount: true, description: true, month: true, year: true, classId: true }
  });
  if (!expense) return errorState("Chi phí không còn tồn tại. Vui lòng tải lại trang.");

  await prisma.$transaction([
    prisma.expense.delete({ where: { id: expense.id } }),
    prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorUsername: actor.username.trim(),
        action: "expense.deleted",
        entityType: "Expense",
        entityId: expense.id,
        metadata: {
          category: expense.category,
          amount: expense.amount,
          description: expense.description,
          month: expense.month,
          year: expense.year,
          classId: expense.classId
        }
      }
    })
  ]);

  revalidateFinancialPaths();
  return successState(
    expense.category === "teacher_salary"
      ? `Đã xóa lần chuyển lương ${formatCurrency(expense.amount)}; số này quay lại phần còn nợ giáo viên.`
      : `Đã xóa chi phí ${formatCurrency(expense.amount)}.`
  );
}

/** Ghi một lần chuyển lương cho giáo viên (một hoặc nhiều lớp/kỳ), xem recordSalaryPayout. */
export async function recordSalaryPayoutAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(salaryPayoutSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  const paidAt = parseDateInput(data.paidAt);
  if (!paidAt) return errorState("Ngày chuyển tiền không hợp lệ.");

  try {
    const recorded = await recordSalaryPayout({ actor, paidAt, note: data.note, lines: data.lines });
    revalidateFinancialPaths();
    const total = recorded.reduce((sum, item) => sum + item.amount, 0);
    const bank = recorded.filter((item) => item.method === "bank_transfer").reduce((sum, item) => sum + item.amount, 0);
    const cash = total - bank;
    // Một tháng có thể có cả dòng chuyển khoản và tiền mặt: còn nợ tính theo từng tháng, không cộng lặp.
    const owedBefore = new Map(recorded.map((item) => [`${item.line.classId}:${item.line.year}:${item.line.month}`, item.line.difference]));
    const remaining = [...owedBefore.values()].reduce((sum, value) => sum + value, 0) - total;
    const teacher = recorded[0]?.line.teacherName || "giáo viên";
    const split = cash !== 0 ? ` (CK ${formatCurrency(bank)} + TM ${formatCurrency(cash)})` : " (chuyển khoản)";
    const tail =
      remaining > 0
        ? ` Còn nợ ${formatCurrency(remaining)}.`
        : remaining < 0
          ? ` Chuyển dư ${formatCurrency(-remaining)} so với học phí đã thu.`
          : " Đã đủ phần học phí đã thu.";
    return successState(
      `Đã ghi ${total >= 0 ? "trả" : "trừ"} ${formatCurrency(Math.abs(total))} cho ${teacher}${split}.${tail}`
    );
  } catch (payoutError) {
    return actionFailure(payoutError, "Không ghi được lần chuyển lương.");
  }
}

/**
 * Đặt riêng ngày chốt lương cho một tháng (tháng đó trả lương khác ngày thường lệ), hoặc bỏ đặt
 * riêng để quay về ngày chốt chung. Lương các tháng liên quan được tính lại ngay.
 */
export async function setSalaryMonthCutoffAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(salaryMonthCutoffSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  const { month, year } = data;
  const audit = (metadata: Record<string, string | number | null>) =>
    prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorUsername: actor.username.trim(),
        action: "salary.cutoff_changed",
        entityType: "SalaryMonthCutoff",
        entityId: `${year}-${month}`,
        metadata: { month, year, ...metadata }
      }
    });

  if (data.intent === "reset" || !data.cutoffDate) {
    await prisma.$transaction([
      prisma.salaryMonthCutoff.deleteMany({ where: { year, month } }),
      audit({ cutoffDate: null })
    ]);
    revalidateFinancialPaths();
    return successState(`Lương T${month}/${year} quay về ngày chốt chung.`);
  }

  const cutoffDate = parseDateInput(data.cutoffDate);
  if (!cutoffDate) return errorState("Ngày chốt không hợp lệ.");
  const offset = periodIndex(cutoffDate.getMonth() + 1, cutoffDate.getFullYear()) - periodIndex(month, year);
  if (offset < 0 || offset > 1) {
    return errorState(`Ngày chốt lương T${month}/${year} phải nằm trong tháng ${month} hoặc tháng kế tiếp.`);
  }

  await prisma.$transaction([
    prisma.salaryMonthCutoff.upsert({
      where: { year_month: { year, month } },
      update: { cutoffDate },
      create: { year, month, cutoffDate }
    }),
    audit({ cutoffDate: data.cutoffDate })
  ]);
  revalidateFinancialPaths();
  return successState(
    `Đã đặt ngày chốt lương T${month}/${year} là ${formatDayMonth(cutoffDate)}: HS nộp sau ngày này tính sang lương tháng sau.`
  );
}
