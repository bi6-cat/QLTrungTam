import { prisma } from "@/lib/prisma";

export type DashboardClassRow = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  archivedAt: Date | null;
  activeStudents: number;
  invoiceCount: number;
  paidCount: number;
  unpaidCount: number;
  waivedCount: number;
  voidCount: number;
  unissuedCount: number;
  expectedAmount: number;
  plannedAmount: number;
  paidAmount: number;
  waivedAmount: number;
  remainingAmount: number;
  collectionRate: number;
};

export type TrendPoint = {
  month: number;
  year: number;
  label: string;
  collected: number;
  outstanding: number;
};

export type DashboardData = {
  month: number;
  year: number;
  isCurrentPeriod: boolean;
  classes: DashboardClassRow[];
  totals: {
    expected: number;
    paid: number;
    remaining: number;
    planned: number;
    students: number;
    unissued: number;
    unpaidCount: number;
    paidCount: number;
    collectionRate: number;
  };
  outstandingAllTime: {
    amount: number;
    invoiceCount: number;
    olderThanThisMonth: number;
  };
  alerts: {
    unmatchedTransactions: number;
    classesWithoutSchedule: number;
    classesWithoutTeacherRate: number;
    salaryNotGenerated: boolean;
  };
  trend: TrendPoint[];
};

function monthIndex(month: number, year: number) {
  return year * 12 + (month - 1);
}

function shiftMonth(month: number, year: number, delta: number) {
  const index = monthIndex(month, year) + delta;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

/**
 * Số liệu tổng quan cho một tháng bất kỳ.
 *
 * Ngoài bức tranh của tháng đang xem, hàm còn trả công nợ lũy kế qua mọi tháng
 * và vài cảnh báo vận hành (giao dịch chưa khớp, lớp chưa xếp lịch, chưa tính
 * lương) để trang tổng quan trả lời được "hôm nay cần làm gì".
 */
export async function getDashboard(month: number, year: number): Promise<DashboardData> {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const periodEnd = new Date(year, month, 1);
  const currentIndex = monthIndex(currentMonth, currentYear);

  // 6 tháng gần nhất tính lùi từ tháng đang xem, dùng cho biểu đồ xu hướng.
  const trendPeriods = Array.from({ length: 6 }, (_, offset) => shiftMonth(month, year, offset - 5));

  const [classes, unpaidAll, unmatchedTransactions, trendGroups, salaryCount] = await Promise.all([
    prisma.classRoom.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        shortCode: true,
        teacherName: true,
        archivedAt: true,
        pricePerSession: true,
        sessionsPerMonthDefault: true,
        teacherSharePercent: true,
        schedules: { select: { id: true } },
        enrollments: {
          where: {
            OR: [
              { createdAt: { lt: periodEnd } },
              { months: { some: { month, year } } },
              { invoices: { some: { month, year } } }
            ]
          },
          select: {
            status: true,
            sessionsOverride: true,
            student: { select: { archivedAt: true } },
            invoices: { where: { month, year }, select: { status: true, amount: true } },
            months: {
              where: { month, year },
              take: 1,
              select: { status: true, sessions: true, pricePerSession: true }
            }
          }
        }
      }
    }),
    prisma.monthlyInvoice.findMany({
      where: { status: "unpaid" },
      select: { amount: true, month: true, year: true }
    }),
    prisma.transaction.count({
      where: { matchedInvoiceId: null, resolvedAt: null, reversedAt: null }
    }),
    prisma.monthlyInvoice.groupBy({
      by: ["year", "month", "status"],
      where: {
        OR: trendPeriods.map((period) => ({ month: period.month, year: period.year })),
        status: { in: ["paid", "unpaid"] }
      },
      _sum: { amount: true }
    }),
    prisma.expense.count({ where: { month, year, category: "teacher_salary" } })
  ]);

  const rows: DashboardClassRow[] = classes
    .map((classRoom) => {
      const active = classRoom.enrollments.filter((enrollment) => {
        if (classRoom.archivedAt || enrollment.student.archivedAt) return false;
        const invoice = enrollment.invoices[0];
        return (
          (enrollment.months[0]?.status ?? (invoice ? "active" : enrollment.status)) === "active"
        );
      });
      const invoices = classRoom.enrollments.flatMap((enrollment) => enrollment.invoices);
      const paid = invoices.filter((invoice) => invoice.status === "paid");
      const unpaid = invoices.filter((invoice) => invoice.status === "unpaid");
      const waived = invoices.filter((invoice) => invoice.status === "waived");
      const voided = invoices.filter((invoice) => invoice.status === "void");
      const paidAmount = paid.reduce((sum, invoice) => sum + invoice.amount, 0);
      const unpaidAmount = unpaid.reduce((sum, invoice) => sum + invoice.amount, 0);
      const expectedAmount = paidAmount + unpaidAmount;

      return {
        id: classRoom.id,
        name: classRoom.name,
        shortCode: classRoom.shortCode,
        teacherName: classRoom.teacherName,
        archivedAt: classRoom.archivedAt,
        activeStudents: active.length,
        invoiceCount: invoices.length,
        paidCount: paid.length,
        unpaidCount: unpaid.length,
        waivedCount: waived.length,
        voidCount: voided.length,
        unissuedCount: active.filter((enrollment) => enrollment.invoices.length === 0).length,
        expectedAmount,
        plannedAmount: active.reduce((sum, enrollment) => {
          const period = enrollment.months[0];
          const sessions =
            period?.sessions ?? enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
          return sum + sessions * (period?.pricePerSession ?? classRoom.pricePerSession);
        }, 0),
        paidAmount,
        waivedAmount: waived.reduce((sum, invoice) => sum + invoice.amount, 0),
        remainingAmount: unpaidAmount,
        collectionRate: expectedAmount > 0 ? paidAmount / expectedAmount : 0
      };
    })
    .filter((row) => !row.archivedAt || row.invoiceCount > 0);

  const totalsExpected = rows.reduce((sum, row) => sum + row.expectedAmount, 0);
  const totalsPaid = rows.reduce((sum, row) => sum + row.paidAmount, 0);

  const trendMap = new Map<string, TrendPoint>();
  for (const period of trendPeriods) {
    trendMap.set(`${period.year}-${period.month}`, {
      month: period.month,
      year: period.year,
      label: `T${period.month}`,
      collected: 0,
      outstanding: 0
    });
  }
  for (const group of trendGroups) {
    const point = trendMap.get(`${group.year}-${group.month}`);
    if (!point) continue;
    if (group.status === "paid") point.collected += group._sum.amount ?? 0;
    else point.outstanding += group._sum.amount ?? 0;
  }

  const activeClasses = classes.filter((classRoom) => !classRoom.archivedAt);
  return {
    month,
    year,
    isCurrentPeriod: month === currentMonth && year === currentYear,
    classes: rows,
    totals: {
      expected: totalsExpected,
      paid: totalsPaid,
      remaining: rows.reduce((sum, row) => sum + row.remainingAmount, 0),
      planned: rows.reduce((sum, row) => sum + row.plannedAmount, 0),
      students: rows.reduce((sum, row) => sum + row.activeStudents, 0),
      unissued: rows.reduce((sum, row) => sum + row.unissuedCount, 0),
      unpaidCount: rows.reduce((sum, row) => sum + row.unpaidCount, 0),
      paidCount: rows.reduce((sum, row) => sum + row.paidCount, 0),
      collectionRate: totalsExpected > 0 ? totalsPaid / totalsExpected : 0
    },
    outstandingAllTime: {
      amount: unpaidAll.reduce((sum, invoice) => sum + invoice.amount, 0),
      invoiceCount: unpaidAll.length,
      olderThanThisMonth: unpaidAll.filter(
        (invoice) => monthIndex(invoice.month, invoice.year) < currentIndex
      ).length
    },
    alerts: {
      unmatchedTransactions,
      classesWithoutSchedule: activeClasses.filter((c) => c.schedules.length === 0).length,
      classesWithoutTeacherRate: activeClasses.filter((c) => c.teacherSharePercent <= 0).length,
      salaryNotGenerated: salaryCount === 0 && activeClasses.length > 0
    },
    trend: [...trendMap.values()]
  };
}
