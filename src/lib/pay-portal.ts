import type { Prisma } from "@prisma/client";
import { buildVietQrImageUrl } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";

export type PayPortalInvoice = {
  id: string;
  month: number;
  year: number;
  amount: number;
  memoContent: string;
  status: "paid" | "unpaid" | "void" | "waived";
  qrImageUrl: string;
};

/** Học sinh còn hiện ở trang nộp tiền: đang học lớp, hoặc vẫn còn hóa đơn chưa đóng. */
function payableEnrollmentWhere(now: Date): Prisma.EnrollmentWhereInput {
  return {
    OR: [
      {
        status: "active",
        student: { archivedAt: null },
        OR: [{ leftAt: null }, { leftAt: { gt: now } }]
      },
      { invoices: { some: { status: "unpaid" } } }
    ]
  };
}

function isPayable(
  input: { classArchived: boolean; studentArchived: boolean; leftAt: Date | null; hasUnpaid: boolean },
  now: Date
) {
  return (
    input.hasUnpaid ||
    (!input.classArchived &&
      !input.studentArchived &&
      (!input.leftAt || input.leftAt.getTime() > now.getTime()))
  );
}

/**
 * Danh sách cho phụ huynh chọn tên con. Chỉ trả tên — hóa đơn, memo (có SĐT) chỉ tải
 * khi chọn từng em, để trang không chứa sẵn dữ liệu của cả lớp.
 */
export async function getPayableStudents(classId: string) {
  const now = new Date();
  const classRoom = await prisma.classRoom.findUnique({
    where: { id: classId },
    select: {
      name: true,
      archivedAt: true,
      enrollments: {
        where: payableEnrollmentWhere(now),
        orderBy: { student: { fullName: "asc" } },
        select: {
          leftAt: true,
          student: { select: { id: true, fullName: true, archivedAt: true } },
          invoices: { where: { status: "unpaid" }, select: { id: true }, take: 1 }
        }
      }
    }
  });
  if (!classRoom) return null;

  const students = classRoom.enrollments
    .filter((enrollment) =>
      isPayable(
        {
          classArchived: Boolean(classRoom.archivedAt),
          studentArchived: Boolean(enrollment.student.archivedAt),
          leftAt: enrollment.leftAt,
          hasUnpaid: enrollment.invoices.length > 0
        },
        now
      )
    )
    .map((enrollment) => ({ id: enrollment.student.id, fullName: enrollment.student.fullName }));

  return { name: classRoom.name, students };
}

/** Hóa đơn của một học sinh trong lớp, kèm ảnh QR. Null khi em đó không hiện ở trang nộp tiền. */
export async function getStudentPayInvoices(
  classId: string,
  studentId: string
): Promise<PayPortalInvoice[] | null> {
  const now = new Date();
  const enrollment = await prisma.enrollment.findFirst({
    where: { classId, studentId, ...payableEnrollmentWhere(now) },
    select: {
      leftAt: true,
      student: { select: { archivedAt: true } },
      classRoom: { select: { archivedAt: true } },
      invoices: {
        where: { status: { in: ["unpaid", "paid", "waived", "void"] } },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { id: true, month: true, year: true, amount: true, memoContent: true, status: true }
      }
    }
  });
  if (
    !enrollment ||
    !isPayable(
      {
        classArchived: Boolean(enrollment.classRoom.archivedAt),
        studentArchived: Boolean(enrollment.student.archivedAt),
        leftAt: enrollment.leftAt,
        hasUnpaid: enrollment.invoices.some((invoice) => invoice.status === "unpaid")
      },
      now
    )
  ) {
    return null;
  }

  const settings = await getAppSettings();
  return enrollment.invoices.map((invoice) => ({
    ...invoice,
    qrImageUrl: buildVietQrImageUrl({
      bankBin: settings.bankBin,
      accountNumber: settings.bankAccountNumber,
      accountName: settings.bankAccountName,
      amount: invoice.amount,
      memo: invoice.memoContent
    })
  }));
}
