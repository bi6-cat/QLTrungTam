import type { Prisma } from "@prisma/client";
import { buildMemo, normalizePhone, parseMemo, pickMemoSuffix, usedMemoSuffixes } from "@/lib/payment";

type Actor = { userId: string | null; username: string };

/**
 * Sau khi sửa hồ sơ học sinh, đồng bộ các hóa đơn CHƯA ĐÓNG của học sinh đó: tên/SĐT hiển thị ở
 * trang lớp (lấy từ bản chụp trên hóa đơn) và memo chuyển khoản theo SĐT mới. Hóa đơn đã đóng,
 * đã hủy hoặc đã miễn là lịch sử nên giữ nguyên.
 *
 * Memo chỉ đổi khi SĐT trong memo khác SĐT hồ sơ. Nếu SĐT mới vẫn trùng một bạn khác trong lớp thì
 * thêm hậu tố B, C, ... như lúc tạo hóa đơn.
 */
export async function syncUnpaidInvoicesWithStudent(
  tx: Prisma.TransactionClient,
  student: { id: string; fullName: string; phone: string },
  actor: Actor
) {
  const invoices = await tx.monthlyInvoice.findMany({
    where: {
      status: "unpaid",
      transactionId: null,
      matchedTransaction: { is: null },
      enrollment: { studentId: student.id }
    },
    select: {
      id: true,
      month: true,
      year: true,
      memoContent: true,
      studentNameSnapshot: true,
      studentPhoneSnapshot: true,
      classShortCodeSnapshot: true,
      updatedAt: true,
      enrollment: { select: { classId: true, classRoom: { select: { shortCode: true } } } }
    }
  });

  const phone = normalizePhone(student.phone);
  const changedMemos: Array<{ from: string; to: string }> = [];

  for (const invoice of invoices) {
    const parsed = parseMemo(invoice.memoContent);
    let memoContent = invoice.memoContent;

    if (parsed?.phone !== phone) {
      const others = await tx.monthlyInvoice.findMany({
        where: {
          id: { not: invoice.id },
          month: invoice.month,
          year: invoice.year,
          enrollment: { classId: invoice.enrollment.classId },
          memoContent: { contains: phone }
        },
        select: { memoContent: true }
      });
      const suffix = pickMemoSuffix(usedMemoSuffixes(others.map((item) => item.memoContent), phone));
      if (suffix === null) {
        throw new Error(
          `Quá nhiều học sinh cùng SĐT ${student.phone} trong lớp ${invoice.enrollment.classRoom.shortCode}, không thể đổi memo của ${student.fullName}.`
        );
      }
      memoContent = buildMemo(
        invoice.classShortCodeSnapshot ?? invoice.enrollment.classRoom.shortCode,
        phone,
        invoice.month,
        invoice.year,
        suffix
      );
    }

    const unchanged =
      memoContent === invoice.memoContent &&
      invoice.studentNameSnapshot === student.fullName &&
      invoice.studentPhoneSnapshot === student.phone;
    if (unchanged) continue;

    const updated = await tx.monthlyInvoice.updateMany({
      where: { id: invoice.id, status: "unpaid", transactionId: null, updatedAt: invoice.updatedAt },
      data: { memoContent, studentNameSnapshot: student.fullName, studentPhoneSnapshot: student.phone }
    });
    if (updated.count !== 1) {
      throw new Error(`Hóa đơn của ${student.fullName} vừa thay đổi hoặc được thanh toán. Vui lòng thử lại.`);
    }

    if (memoContent !== invoice.memoContent) {
      changedMemos.push({ from: invoice.memoContent, to: memoContent });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          actorUsername: actor.username.trim(),
          action: "invoice.memo_changed",
          entityType: "MonthlyInvoice",
          entityId: invoice.id,
          reason: "Đổi SĐT hồ sơ học sinh",
          metadata: { from: invoice.memoContent, to: memoContent, month: invoice.month, year: invoice.year }
        }
      });
    }
  }

  return changedMemos;
}
