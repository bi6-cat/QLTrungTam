import { prisma } from "@/lib/prisma";
import { periodIndex } from "@/lib/enrollment-period";
import { countScheduledSessions } from "@/lib/schedule";
import { loadSalaryLines, type SalaryLine } from "@/lib/salary";

/**
 * Hai góc nhìn tách bạch, không trộn:
 *
 * 1. Lãi/lỗ theo KỲ HỌC PHÍ (tháng dạy): doanh thu = tiền thực thu của hóa đơn thuộc kỳ,
 *    lương GV = % × doanh thu đó (dù chuyển lúc nào), chi phí khác = chi phí ghi cho kỳ.
 *    Tiền tháng 9 nộp muộn vẫn là doanh thu và lương của tháng 9.
 * 2. Dòng tiền trong THÁNG (theo ngày tiền về): tiền thực nhận trong tháng, tách theo kỳ học
 *    phí và hình thức — dùng để đối chiếu sao kê ngân hàng.
 */

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
};

export type MonthlyCashIn = {
  total: number;
  currentPeriod: number;
  earlierPeriods: number;
  laterPeriods: number;
  bankTransfer: number;
  cash: number;
};

export type MonthlyFinance = {
  month: number;
  year: number;
  /** Tiền thực thu của hóa đơn kỳ này. */
  collected: number;
  /** Chênh lệch giữa số tiền hóa đơn và tiền thực nhận (gán lệch tiền): dương = thu thiếu. */
  collectedShortfall: number;
  outstanding: number;
  waived: number;
  /** Lương phải trả theo học phí đã thu của kỳ (kể cả phần chưa chuyển). */
  teacherCost: number;
  /** Lương đã chuyển (tổng các lần chuyển đã ghi) của kỳ. */
  teacherSettled: number;
  otherCost: number;
  totalCost: number;
  profit: number;
  marginRate: number;
  costsByCategory: Array<{ category: string; amount: number }>;
  classMargins: ClassMargin[];
  salaryLines: SalaryLine[];
  cashIn: MonthlyCashIn;
};

export async function getMonthlyFinance(month: number, year: number): Promise<MonthlyFinance> {
  const periodStart = new Date(year, month - 1, 1);
  const periodEnd = new Date(year, month, 1);
  const [invoiceGroups, expenses, classes, paidInMonth, salaryLines] = await Promise.all([
    prisma.monthlyInvoice.groupBy({
      by: ["status"],
      where: { month, year },
      _sum: { amount: true, paidAmount: true }
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
        schedules: { select: { weekday: true } },
        enrollments: {
          select: {
            invoices: {
              where: { month, year, status: { in: ["paid", "unpaid"] } },
              select: { status: true, amount: true, paidAmount: true }
            }
          }
        }
      }
    }),
    prisma.monthlyInvoice.findMany({
      where: { status: "paid", paidAt: { gte: periodStart, lt: periodEnd } },
      select: {
        month: true,
        year: true,
        amount: true,
        paidAmount: true,
        transaction: { select: { paymentMethod: true } }
      }
    }),
    loadSalaryLines(month, year)
  ]);

  const currentIndex = periodIndex(month, year);
  const cashIn: MonthlyCashIn = {
    total: 0,
    currentPeriod: 0,
    earlierPeriods: 0,
    laterPeriods: 0,
    bankTransfer: 0,
    cash: 0
  };
  for (const invoice of paidInMonth) {
    const received = invoice.paidAmount ?? invoice.amount;
    const index = periodIndex(invoice.month, invoice.year);
    cashIn.total += received;
    if (index === currentIndex) cashIn.currentPeriod += received;
    else if (index < currentIndex) cashIn.earlierPeriods += received;
    else cashIn.laterPeriods += received;
    if (invoice.transaction?.paymentMethod === "cash") cashIn.cash += received;
    else cashIn.bankTransfer += received;
  }

  const paidGroup = invoiceGroups.find((row) => row.status === "paid");
  const collected = paidGroup?._sum.paidAmount ?? paidGroup?._sum.amount ?? 0;
  const collectedShortfall = (paidGroup?._sum.amount ?? 0) - collected;
  const outstanding = invoiceGroups.find((row) => row.status === "unpaid")?._sum.amount ?? 0;
  const waived = invoiceGroups.find((row) => row.status === "waived")?._sum.amount ?? 0;

  // Lương theo lớp lấy từ bảng lương (số phải trả); lương chung không gắn lớp lấy theo bản ghi.
  const salaryByClass = new Map(salaryLines.map((line) => [line.classId, line]));
  const generalSalary = expenses
    .filter((expense) => expense.category === "teacher_salary" && !expense.classId)
    .reduce((sum, expense) => sum + expense.amount, 0);
  const teacherCost = salaryLines.reduce((sum, line) => sum + line.due, 0) + generalSalary;
  const teacherSettled = salaryLines.reduce((sum, line) => sum + line.paidOut, 0) + generalSalary;

  const otherExpenses = expenses.filter((expense) => expense.category !== "teacher_salary");
  const otherCost = otherExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const totalCost = teacherCost + otherCost;

  const categoryTotals = new Map<string, number>();
  if (teacherCost !== 0) categoryTotals.set("teacher_salary", teacherCost);
  for (const expense of otherExpenses) {
    categoryTotals.set(expense.category, (categoryTotals.get(expense.category) ?? 0) + expense.amount);
  }

  const otherCostByClass = new Map<string, number>();
  for (const expense of otherExpenses) {
    if (!expense.classId) continue;
    otherCostByClass.set(expense.classId, (otherCostByClass.get(expense.classId) ?? 0) + expense.amount);
  }

  const classMargins: ClassMargin[] = classes
    .map((classRoom) => {
      const invoices = classRoom.enrollments.flatMap((enrollment) => enrollment.invoices);
      const classCollected = invoices
        .filter((invoice) => invoice.status === "paid")
        .reduce((sum, invoice) => sum + (invoice.paidAmount ?? invoice.amount), 0);
      const classOutstanding = invoices
        .filter((invoice) => invoice.status === "unpaid")
        .reduce((sum, invoice) => sum + invoice.amount, 0);
      const classTeacherCost = salaryByClass.get(classRoom.id)?.due ?? 0;
      const classOtherCost = otherCostByClass.get(classRoom.id) ?? 0;
      return {
        classId: classRoom.id,
        name: classRoom.name,
        shortCode: classRoom.shortCode,
        teacherName: classRoom.teacherName,
        collected: classCollected,
        outstanding: classOutstanding,
        teacherCost: classTeacherCost,
        otherCost: classOtherCost,
        margin: classCollected - classTeacherCost - classOtherCost,
        sessions: countScheduledSessions(classRoom.schedules, month, year),
        // Lớp lưu trữ chỉ hiện khi kỳ đó thực sự có phát sinh.
        visible:
          !classRoom.archivedAt || invoices.length > 0 || classTeacherCost !== 0 || classOtherCost !== 0
      };
    })
    .filter((row) => row.visible)
    .map(({ visible: _visible, ...row }) => row)
    .sort((left, right) => right.margin - left.margin);

  const profit = collected - totalCost;
  return {
    month,
    year,
    collected,
    collectedShortfall,
    outstanding,
    waived,
    teacherCost,
    teacherSettled,
    otherCost,
    totalCost,
    profit,
    marginRate: collected > 0 ? profit / collected : 0,
    costsByCategory: [...categoryTotals.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((left, right) => right.amount - left.amount),
    classMargins,
    salaryLines,
    cashIn
  };
}

export type FinanceTrendPoint = {
  month: number;
  year: number;
  collected: number;
  teacherCost: number;
  otherCost: number;
  profit: number;
};

/** Lãi/lỗ theo kỳ của `count` tháng gần nhất tính đến kỳ đang xem. */
export async function getFinanceTrend(month: number, year: number, count = 6): Promise<FinanceTrendPoint[]> {
  const periods = Array.from({ length: count }, (_, offset) => {
    const index = periodIndex(month, year) - (count - 1 - offset);
    return { month: (index % 12) + 1, year: Math.floor(index / 12) };
  });
  const periodFilter = periods.map((period) => ({ month: period.month, year: period.year }));

  const [paidGroups, expenseGroups, generalSalaryGroups, salaryLinesByPeriod] = await Promise.all([
    prisma.monthlyInvoice.groupBy({
      by: ["year", "month"],
      where: { status: "paid", OR: periodFilter },
      _sum: { amount: true, paidAmount: true }
    }),
    prisma.expense.groupBy({
      by: ["year", "month"],
      where: { category: { not: "teacher_salary" }, OR: periodFilter },
      _sum: { amount: true }
    }),
    prisma.expense.groupBy({
      by: ["year", "month"],
      where: { category: "teacher_salary", classId: null, OR: periodFilter },
      _sum: { amount: true }
    }),
    Promise.all(periods.map((period) => loadSalaryLines(period.month, period.year)))
  ]);

  return periods.map((period, index) => {
    const match = <T extends { month: number; year: number }>(rows: T[]) =>
      rows.find((row) => row.month === period.month && row.year === period.year);
    const paid = match(paidGroups);
    const collected = paid?._sum.paidAmount ?? paid?._sum.amount ?? 0;
    const teacherCost =
      salaryLinesByPeriod[index].reduce((sum, line) => sum + line.due, 0) +
      (match(generalSalaryGroups)?._sum.amount ?? 0);
    const otherCost = match(expenseGroups)?._sum.amount ?? 0;
    return { ...period, collected, teacherCost, otherCost, profit: collected - teacherCost - otherCost };
  });
}
