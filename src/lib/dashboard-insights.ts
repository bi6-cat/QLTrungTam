import {
  buildCalendar,
  isoParts,
  isoToDbDate,
  monthRange,
  summarizeSessions,
  todayInVietnam,
  type IsoDate
} from "@/lib/class-sessions";
import { scheduleSlotSelect, sessionRecordSelect, toScheduleSlot, toSessionRecord } from "@/lib/class-sessions-server";
import { prisma } from "@/lib/prisma";
import { compareStudentNames } from "@/lib/student-search";

// Số liệu phụ cho trang tổng quan: lịch hôm nay, điểm danh, nợ nhiều nhất, tiền về gần đây,
// biến động học sinh. Tách khỏi getDashboard để phần học phí giữ nguyên.

export type TodaySession = {
  key: string;
  classId: string;
  className: string;
  teacherName: string;
  colorIndex: number;
  startTime: string;
  endTime: string;
  room: string;
  status: "held" | "cancelled" | "makeup" | "pending" | "upcoming";
};

export type TopDebtor = {
  studentId: string;
  studentName: string;
  amount: number;
  invoiceCount: number;
  oldestMonth: number;
  oldestYear: number;
  classNames: string[];
};

export type RecentPayment = {
  id: string;
  amount: number;
  transferredAt: Date;
  method: "bank_transfer" | "cash";
  studentName: string | null;
  className: string | null;
  month: number | null;
  year: number | null;
};

export type DashboardInsights = {
  today: IsoDate;
  todaySessions: TodaySession[];
  attendance: { total: number; held: number; cancelled: number; makeup: number; pending: number; upcoming: number };
  topDebtors: TopDebtor[];
  recentPayments: RecentPayment[];
  cashIn: { total: number; count: number; bankTransfer: number; cash: number; unmatched: number };
  students: { active: number; joined: number; left: number };
};

export async function getDashboardInsights(month: number, year: number): Promise<DashboardInsights> {
  const today = todayInVietnam();
  const range = monthRange(month, year);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 1);
  const todayMonth = isoParts(today);
  const loadFrom = range.from < today ? range.from : today;
  const loadTo = range.to > today ? range.to : today;

  const [classes, unpaid, payments, cashGroups, unmatchedInMonth, activeEnrollments, joined, left] = await Promise.all([
    prisma.classRoom.findMany({
      where: { archivedAt: null },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        teacherName: true,
        schedules: { select: scheduleSlotSelect },
        sessions: {
          where: { date: { gte: isoToDbDate(loadFrom), lte: isoToDbDate(loadTo) } },
          select: sessionRecordSelect
        }
      }
    }),
    prisma.monthlyInvoice.findMany({
      where: { status: "unpaid" },
      select: {
        amount: true,
        month: true,
        year: true,
        enrollment: {
          select: {
            student: { select: { id: true, fullName: true, archivedAt: true } },
            classRoom: { select: { name: true } }
          }
        }
      }
    }),
    prisma.transaction.findMany({
      where: { reversedAt: null, matchedInvoiceId: { not: null } },
      orderBy: [{ transferredAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        amount: true,
        transferredAt: true,
        paymentMethod: true,
        matchedInvoice: {
          select: {
            month: true,
            year: true,
            studentNameSnapshot: true,
            classNameSnapshot: true,
            enrollment: { select: { student: { select: { fullName: true } }, classRoom: { select: { name: true } } } }
          }
        }
      }
    }),
    prisma.transaction.groupBy({
      by: ["paymentMethod"],
      where: { reversedAt: null, transferredAt: { gte: monthStart, lt: monthEnd } },
      _sum: { amount: true },
      _count: { _all: true }
    }),
    prisma.transaction.count({
      where: { reversedAt: null, matchedInvoiceId: null, resolvedAt: null, transferredAt: { gte: monthStart, lt: monthEnd } }
    }),
    prisma.enrollment.findMany({
      where: {
        status: "active",
        startDate: { lt: monthEnd },
        OR: [{ leftAt: null }, { leftAt: { gt: monthStart } }],
        student: { archivedAt: null },
        classRoom: { archivedAt: null }
      },
      select: { studentId: true }
    }),
    prisma.enrollment.count({
      where: { startDate: { gte: monthStart, lt: monthEnd }, student: { archivedAt: null } }
    }),
    // leftAt = ngày đầu của tháng đầu tiên không còn học, nên "nghỉ từ tháng này" là leftAt trong tháng.
    prisma.enrollment.count({ where: { leftAt: { gte: monthStart, lt: monthEnd } } })
  ]);

  // --- Lịch hôm nay + điểm danh của tháng đang xem ---
  const classIndex = new Map(classes.map((classRoom, index) => [classRoom.id, index]));
  const classById = new Map(classes.map((classRoom) => [classRoom.id, classRoom]));
  const slots = classes.flatMap((classRoom) => classRoom.schedules.map(toScheduleSlot));
  const records = classes.flatMap((classRoom) => classRoom.sessions.map(toSessionRecord));
  const todaySessions: TodaySession[] = buildCalendar({ slots, records, from: today, to: today, today }).map((session) => {
    const classRoom = classById.get(session.classId);
    return {
      key: session.key,
      classId: session.classId,
      className: classRoom?.name ?? "",
      teacherName: classRoom?.teacherName ?? "",
      colorIndex: classIndex.get(session.classId) ?? 0,
      startTime: session.startTime,
      endTime: session.endTime,
      room: session.room,
      status: session.status
    };
  });
  const attendance = summarizeSessions(buildCalendar({ slots, records, from: range.from, to: range.to, today }));

  // --- Nợ nhiều nhất (cộng dồn mọi tháng còn nợ) ---
  const debtors = new Map<string, TopDebtor>();
  for (const invoice of unpaid) {
    const student = invoice.enrollment.student;
    if (student.archivedAt) continue;
    const current = debtors.get(student.id) ?? {
      studentId: student.id,
      studentName: student.fullName,
      amount: 0,
      invoiceCount: 0,
      oldestMonth: invoice.month,
      oldestYear: invoice.year,
      classNames: []
    };
    current.amount += invoice.amount;
    current.invoiceCount += 1;
    if (invoice.year * 12 + invoice.month < current.oldestYear * 12 + current.oldestMonth) {
      current.oldestMonth = invoice.month;
      current.oldestYear = invoice.year;
    }
    if (!current.classNames.includes(invoice.enrollment.classRoom.name)) current.classNames.push(invoice.enrollment.classRoom.name);
    debtors.set(student.id, current);
  }
  const topDebtors = [...debtors.values()]
    .sort((left, right) => right.amount - left.amount || compareStudentNames(left.studentName, right.studentName))
    .slice(0, 6);

  const cashIn = { total: 0, count: 0, bankTransfer: 0, cash: 0, unmatched: unmatchedInMonth };
  for (const group of cashGroups) {
    const amount = group._sum.amount ?? 0;
    cashIn.total += amount;
    cashIn.count += group._count._all;
    if (group.paymentMethod === "cash") cashIn.cash += amount;
    else cashIn.bankTransfer += amount;
  }

  return {
    today,
    // Lịch hôm nay chỉ có nghĩa khi đang xem tháng hiện tại.
    todaySessions: todayMonth.month === month && todayMonth.year === year ? todaySessions : [],
    attendance,
    topDebtors,
    recentPayments: payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      transferredAt: payment.transferredAt,
      method: payment.paymentMethod,
      studentName: payment.matchedInvoice?.enrollment.student.fullName ?? payment.matchedInvoice?.studentNameSnapshot ?? null,
      className: payment.matchedInvoice?.enrollment.classRoom.name ?? payment.matchedInvoice?.classNameSnapshot ?? null,
      month: payment.matchedInvoice?.month ?? null,
      year: payment.matchedInvoice?.year ?? null
    })),
    cashIn,
    students: { active: new Set(activeEnrollments.map((row) => row.studentId)).size, joined, left }
  };
}
