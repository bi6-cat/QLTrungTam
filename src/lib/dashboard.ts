import { prisma } from "@/lib/prisma";

export async function getCurrentDashboard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const periodEnd = new Date(year, month, 1);

  const classes = await prisma.classRoom.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      enrollments: {
        where: {
          OR: [
            { createdAt: { lt: periodEnd } },
            { months: { some: { month, year } } },
            { invoices: { some: { month, year } } }
          ]
        },
        include: {
          student: true,
          invoices: {
            where: { month, year }
          },
          months: { where: { month, year }, take: 1 }
        }
      }
    }
  });

  return {
    month,
    year,
    classes: classes.map((classRoom) => {
      const active = classRoom.enrollments.filter((item) => {
        if (classRoom.archivedAt || item.student.archivedAt) return false;
        const invoice = item.invoices[0];
        return (item.months[0]?.status ?? (invoice ? "active" : item.status)) === "active";
      });
      const invoices = classRoom.enrollments.flatMap((item) => item.invoices);
      const paid = invoices.filter((item) => item.status === "paid");
      const unpaid = invoices.filter((item) => item.status === "unpaid");
      const waived = invoices.filter((item) => item.status === "waived");
      const voided = invoices.filter((item) => item.status === "void");
      const plannedAmount = active.reduce((sum, enrollment) => {
        const period = enrollment.months[0];
        const sessions = period?.sessions ?? enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
        const pricePerSession = period?.pricePerSession ?? classRoom.pricePerSession;
        return sum + sessions * pricePerSession;
      }, 0);
      const paidAmount = paid.reduce((sum, item) => sum + item.amount, 0);
      const unpaidAmount = unpaid.reduce((sum, item) => sum + item.amount, 0);
      return {
        ...classRoom,
        activeStudents: active.length,
        invoiceCount: invoices.length,
        paidCount: paid.length,
        unpaidCount: unpaid.length,
        waivedCount: waived.length,
        voidCount: voided.length,
        unissuedCount: active.filter((item) => item.invoices.length === 0).length,
        expectedAmount: paidAmount + unpaidAmount,
        plannedAmount,
        paidAmount,
        waivedAmount: waived.reduce((sum, item) => sum + item.amount, 0),
        remainingAmount: unpaidAmount
      };
    }).filter((classRoom) => !classRoom.archivedAt || classRoom.invoiceCount > 0)
  };
}
