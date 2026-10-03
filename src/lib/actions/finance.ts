"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure, revalidateFinancialPaths, runSerializableAction } from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import { formatCurrency } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { loadSalaryLines, salaryRecordDescription } from "@/lib/salary";
import { expenseCategoryLabel } from "@/lib/schedule";
import { expenseSchema, safeParseForm, settleSalarySchema } from "@/lib/validation";

export async function createExpenseAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  await requireAdmin();
  const { data, error } = safeParseForm(expenseSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  // Lương theo lớp chỉ tạo bằng nút "Chốt lương" để luôn khớp với học phí đã thu của kỳ.
  if (data.category === "teacher_salary" && data.classId) {
    return errorState(
      'Lương giáo viên theo lớp được chốt ở bảng "Lương giáo viên". Khoản lương nhập tay chỉ dùng cho chi phí chung (không gắn lớp).'
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
      ? "Đã xóa bản ghi lương; khoản này quay lại phần chưa chốt."
      : `Đã xóa chi phí ${formatCurrency(expense.amount)}.`
  );
}

/**
 * Chốt lương cho một giáo viên trong một kỳ: mỗi lớp còn chênh lệch giữa lương phải trả
 * (theo học phí đã thu của kỳ) và số đã chốt sẽ có thêm một bản ghi chi phí của CHÍNH kỳ đó.
 */
export async function settleTeacherSalaryAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(settleSalarySchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  const classIds = Array.from(new Set(formData.getAll("classId").map(String).filter(Boolean))).slice(0, 100);
  if (classIds.length === 0) return errorState("Không có lớp nào để chốt lương.");

  try {
    const settled = await runSerializableAction(async (tx) => {
      const lines = await loadSalaryLines(data.month, data.year, { db: tx, classIds });
      const pending = lines.filter((line) => line.mode === "percent" && line.difference !== 0);
      for (const line of pending) {
        const expense = await tx.expense.create({
          data: {
            month: data.month,
            year: data.year,
            category: "teacher_salary",
            classId: line.classId,
            description: salaryRecordDescription(line),
            amount: line.difference,
            sharePercent: line.sharePercent,
            baseAmount: line.collected
          },
          select: { id: true }
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            actorUsername: actor.username.trim(),
            action: "salary.settled",
            entityType: "Expense",
            entityId: expense.id,
            metadata: {
              classId: line.classId,
              month: data.month,
              year: data.year,
              sharePercent: line.sharePercent,
              collected: line.collected,
              due: line.due,
              previouslySettled: line.paidOut,
              amount: line.difference
            }
          }
        });
      }
      return pending;
    });

    if (settled.length === 0) {
      return errorState("Không có chênh lệch nào cần chốt: lương đã khớp với học phí đã thu của kỳ.");
    }
    revalidateFinancialPaths();
    const total = settled.reduce((sum, line) => sum + line.difference, 0);
    const teacher = settled[0].teacherName || "giáo viên";
    return successState(
      `Đã chốt lương ${teacher} T${data.month}/${data.year}: ${settled.length} lớp, ${total >= 0 ? "" : "giảm "}${formatCurrency(Math.abs(total))}.`
    );
  } catch (settleError) {
    return actionFailure(settleError, "Không chốt được lương.");
  }
}
