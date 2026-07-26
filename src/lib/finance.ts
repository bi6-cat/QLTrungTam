import { prisma } from "@/lib/prisma";
import { countScheduledSessions } from "@/lib/schedule";

export type ClassMargin = {
  classId: string;
  name: string;
  shortCode: string;
  teacherName: string;
  collected: number;
  outstanding: number;
  teacherCost: number;
  otherCost: number;
  margin: number;
  sessions: number | null;
  teacherSharePercent: number;
  hasSalaryRecord: boolean;
};

export type MonthlyFinance = {
  month: number;
  year: number;
  collected: number;
  outstanding: number;
  waived: number;
  totalExpense: number;
  teacherCost: number;
  otherCost: number;
  profit: number;
  marginRate: number;
  expensesByCategory: Array<{ category: string; amount: number }>;
  classMargins: ClassMargin[];
};

/**
 * Bức tranh thu chi của một tháng.
 *
 * Doanh thu ghi nhận theo **kỳ học phí** của hóa đơn (không theo ngày tiền về)
 * để lãi/lỗ của tháng phản ánh đúng việc dạy trong tháng đó. Tiền tháng 7 thu
 * muộn sang tháng 8 vẫn được tính vào tháng 7.
 */
export async function getMonthlyFinance(month: number, year: number): Promise<MonthlyFinance> {
  const [invoices, expenses, classes] = await Promise.all([
    prisma.monthlyInvoice.groupBy({
      by: ["status"],
      where: { month, year },
      _sum: { amount: true }
    }),
    prisma.expense.findMany({
      where: { month, year },
      select: { category: true, amount: true, classId: true }
    }),
    prisma.classRoom.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        shortCode: true,
        teacherName: true,
        archivedAt: true,
        teacherSharePercent: true,
        sessionsPerMonthDefault: true,
        schedules: { select: { weekday: true } },
        enrollments: {
          select: {
            invoices: {
              where: { month, year },
              select: { status: true, amount: true }
            }
          }
        }
      }
    })
  ]);

  const sumByStatus = (status: string) =>
    invoices.find((row) => row.status === status)?._sum.amount ?? 0;
  const collected = sumByStatus("paid");
  const outstanding = sumByStatus("unpaid");
  const waived = sumByStatus("waived");

  const teacherCost = expenses
    .filter((expense) => expense.category === "teacher_salary")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalExpense = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const otherCost = totalExpense - teacherCost;

  const categoryTotals = new Map<string, number>();
  for (const expense of expenses) {
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount);
  }

  const costByClass = new Map<string, { teacher: number; other: number; hasSalary: boolean }>();
  for (const expense of expenses) {
    if (!expense.classId) continue;
    const entry = costByClass.get(expense.classId) ?? { teacher: 0, other: 0, hasSalary: false };
    if (expense.category === "teacher_salary") {
      entry.teacher += expense.amount;
      entry.hasSalary = true;
    } else {
      entry.other += expense.amount;
    }
    costByClass.set(expense.classId, entry);
  }

  const classMargins: ClassMargin[] = classes
    .map((classRoom) => {
      const periodInvoices = classRoom.enrollments.flatMap((enrollment) => enrollment.invoices);
      const classCollected = periodInvoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + invoice.amount, 0);
      const classOutstanding = periodInvoices
        .filter((invoice) => invoice.status === "unpaid")
        .reduce((sum, invoice) => sum + invoice.amount, 0);
      const cost = costByClass.get(classRoom.id) ?? { teacher: 0, other: 0, hasSalary: false };

      return {
        classId: classRoom.id,
        name: classRoom.name,
        shortCode: classRoom.shortCode,
        teacherName: classRoom.teacherName,
        collected: classCollected,
        outstanding: classOutstanding,
        teacherCost: cost.teacher,
        otherCost: cost.other,
        margin: classCollected - cost.teacher - cost.other,
        sessions: countScheduledSessions(classRoom.schedules, month, year),
        teacherSharePercent: classRoom.teacherSharePercent,
        hasSalaryRecord: cost.hasSalary,
        archived: Boolean(classRoom.archivedAt),
        hasActivity: periodInvoices.length > 0 || cost.teacher > 0 || cost.other > 0
      };
    })
    // Lớp lưu trữ chỉ hiện khi tháng đó thực sự có phát sinh.
    .filter((row) => !row.archived || row.hasActivity)
    .map(({ archived: _archived, hasActivity: _hasActivity, ...row }) => row)
    .sort((left, right) => right.margin - left.margin);

  const profit = collected - totalExpense;
  return {
    month,
    year,
    collected,
    outstanding,
    waived,
    totalExpense,
    teacherCost,
    otherCost,
    profit,
    marginRate: collected > 0 ? profit / collected : 0,
    expensesByCategory: [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount),
    classMargins
  };
}
