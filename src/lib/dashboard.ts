import { prisma } from "@/lib/prisma";

export async function getCurrentDashboard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const classes = await prisma.classRoom.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      enrollments: {
        include: {
          student: true,
          invoices: {
            where: { month, year }
          }
        }
      }
    }
  });

  return {
    month,
    year,
    classes: classes.map((classRoom) => {
      const active = classRoom.enrollments.filter((item) => item.status === "active");
      const invoices = active.flatMap((item) => item.invoices);
      const paid = invoices.filter((item) => item.status === "paid");
      const expectedAmount = active.reduce((sum, enrollment) => {
        const invoice = enrollment.invoices[0];
        if (invoice) return sum + invoice.amount;
        const sessions = enrollment.sessionsOverride ?? classRoom.sessionsPerMonthDefault;
        return sum + sessions * classRoom.pricePerSession;
      }, 0);
      const paidAmount = paid.reduce((sum, item) => sum + item.amount, 0);
      return {
        ...classRoom,
        activeStudents: active.length,
        invoiceCount: invoices.length,
        paidCount: paid.length,
        unpaidCount: active.length - paid.length,
        expectedAmount,
        paidAmount,
        remainingAmount: Math.max(0, expectedAmount - paidAmount)
      };
    })
  };
}
