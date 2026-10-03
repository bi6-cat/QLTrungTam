"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import {
  actionFailure,
  parseDateInput,
  revalidateFinancialPaths,
  revalidateRosterPaths,
  runSerializableAction
} from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import { periodIndex, periodStartDate } from "@/lib/enrollment-period";
import { formatMonth } from "@/lib/format";
import { enrollmentSchema, safeParseForm } from "@/lib/validation";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" });

/**
 * Thêm một học sinh vào lớp kèm ngày bắt đầu học.
 *
 * Học sinh từng nghỉ lớp này quay lại: dùng lại ghi danh cũ, đặt ngày bắt đầu mới và xóa
 * mốc nghỉ. Các tháng đã nghỉ (không có kế hoạch/hóa đơn) không "sống lại" vì đều trước
 * ngày bắt đầu mới; các tháng đã học trước đó vẫn hiện nhờ dữ liệu hóa đơn của chúng.
 */
export async function createEnrollmentAction(formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data, error } = safeParseForm(enrollmentSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");
  const startDate = parseDateInput(data.startDate);
  if (!startDate) return errorState("Ngày bắt đầu học không hợp lệ.");

  try {
    const result = await runSerializableAction(async (tx) => {
      const [student, classRoom, existing] = await Promise.all([
        tx.student.findUnique({ where: { id: data.studentId }, select: { fullName: true, archivedAt: true } }),
        tx.classRoom.findUnique({ where: { id: data.classId }, select: { name: true, archivedAt: true } }),
        tx.enrollment.findUnique({
          where: { studentId_classId: { studentId: data.studentId, classId: data.classId } },
          select: { id: true, startDate: true, leftAt: true }
        })
      ]);

      if (!student) throw new Error("Không tìm thấy học sinh.");
      if (!classRoom) throw new Error("Không tìm thấy lớp học.");
      if (student.archivedAt) throw new Error("Không thể ghi danh học sinh đã lưu trữ.");
      if (classRoom.archivedAt) throw new Error("Không thể ghi danh vào lớp đã lưu trữ.");

      if (!existing) {
        await tx.enrollment.create({
          data: {
            studentId: data.studentId,
            classId: data.classId,
            sessionsOverride: data.sessionsOverride,
            status: data.status,
            startDate
          }
        });
        return { studentName: student.fullName, rejoined: false };
      }

      if (!existing.leftAt) {
        throw new Error(`${student.fullName} đã có trong lớp (bắt đầu học ${dateFormatter.format(existing.startDate)}).`);
      }

      await tx.enrollment.update({
        where: { id: existing.id },
        data: { sessionsOverride: data.sessionsOverride, status: data.status, leftAt: null, startDate }
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          actorUsername: actor.username.trim(),
          action: "enrollment.rejoined",
          entityType: "Enrollment",
          entityId: existing.id,
          metadata: {
            className: classRoom.name,
            studentName: student.fullName,
            previousStartDate: existing.startDate.toISOString(),
            previousLeftAt: existing.leftAt.toISOString(),
            startDate: startDate.toISOString()
          }
        }
      });
      return { studentName: student.fullName, rejoined: true };
    });

    revalidateRosterPaths();
    return successState(
      result.rejoined
        ? `${result.studentName} quay lại học từ ${dateFormatter.format(startDate)}.`
        : `Đã thêm ${result.studentName} vào lớp.`
    );
  } catch (enrollError) {
    return actionFailure(enrollError, "Không thêm được học sinh vào lớp.");
  }
}

export type LeaveClassInput = {
  enrollmentId: string;
  fromMonth: number;
  fromYear: number;
  reason: string;
};

/**
 * Cho học sinh nghỉ một lớp từ đầu tháng chỉ định. Hóa đơn chưa đóng từ tháng đó trở đi
 * bị hủy kèm lý do; nếu đã đóng tiền tháng đó thì chặn để admin chọn tháng sau hoặc
 * hoàn giao dịch trước. Học sinh vẫn học các lớp khác bình thường.
 */
export async function leaveClassAction(input: LeaveClassInput): Promise<ResultState> {
  const actor = await requireAdmin();
  const enrollmentId = String(input.enrollmentId ?? "");
  const fromMonth = Number(input.fromMonth);
  const fromYear = Number(input.fromYear);
  const reason = String(input.reason ?? "").trim();
  if (
    !enrollmentId ||
    !Number.isInteger(fromMonth) ||
    fromMonth < 1 ||
    fromMonth > 12 ||
    !Number.isInteger(fromYear) ||
    fromYear < 2000 ||
    fromYear > 2100
  ) {
    return errorState("Tháng nghỉ không hợp lệ.");
  }
  if (!reason || reason.length > 500) return errorState("Nhập lý do nghỉ từ 1 đến 500 ký tự.");

  try {
    const names = await runSerializableAction(async (tx) => {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        select: {
          id: true,
          leftAt: true,
          student: { select: { fullName: true } },
          classRoom: { select: { name: true } },
          invoices: {
            select: {
              id: true,
              month: true,
              year: true,
              status: true,
              transactionId: true,
              paidAt: true,
              updatedAt: true,
              matchedTransaction: { select: { id: true } }
            }
          }
        }
      });
      if (!enrollment) throw new Error("Không tìm thấy ghi danh.");

      const fromIndex = periodIndex(fromMonth, fromYear);
      const affected = enrollment.invoices.filter((invoice) => periodIndex(invoice.month, invoice.year) >= fromIndex);
      const paid = affected.find((invoice) => invoice.status === "paid");
      if (paid) {
        throw new Error(
          `${enrollment.student.fullName} đã đóng học phí tháng ${paid.month}/${paid.year}. ` +
            "Chọn nghỉ từ tháng sau, hoặc hoàn giao dịch đó trước."
        );
      }

      const changedAt = new Date();
      const voidable = affected.filter((item) => item.status === "unpaid");
      for (const invoice of voidable) {
        if (invoice.transactionId || invoice.paidAt || invoice.matchedTransaction) {
          throw new Error(`Hóa đơn tháng ${invoice.month}/${invoice.year} đang gắn giao dịch, cần đối soát trước.`);
        }
        const voided = await tx.monthlyInvoice.updateMany({
          where: { id: invoice.id, status: "unpaid", transactionId: null, updatedAt: invoice.updatedAt },
          data: { status: "void", statusReason: `Nghỉ học: ${reason}`, statusChangedAt: changedAt }
        });
        if (voided.count !== 1) {
          throw new Error(`Hóa đơn tháng ${invoice.month}/${invoice.year} vừa thay đổi. Vui lòng tải lại.`);
        }
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            actorUsername: actor.username.trim(),
            action: "invoice.voided",
            entityType: "MonthlyInvoice",
            entityId: invoice.id,
            reason: `Nghỉ học: ${reason}`,
            metadata: { previousStatus: "unpaid", targetStatus: "void", month: invoice.month, year: invoice.year }
          }
        });
      }

      // Kế hoạch số buổi từ tháng nghỉ trở đi không còn ý nghĩa.
      await tx.enrollmentMonth.deleteMany({
        where: {
          enrollmentId: enrollment.id,
          OR: [{ year: { gt: fromYear } }, { year: fromYear, month: { gte: fromMonth } }]
        }
      });

      const leftAt = periodStartDate(fromMonth, fromYear);
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { leftAt } });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          actorUsername: actor.username.trim(),
          action: "enrollment.left",
          entityType: "Enrollment",
          entityId: enrollment.id,
          reason,
          metadata: {
            className: enrollment.classRoom.name,
            studentName: enrollment.student.fullName,
            previousLeftAt: enrollment.leftAt?.toISOString() ?? null,
            leftAt: leftAt.toISOString(),
            voidedInvoiceIds: voidable.map((item) => item.id)
          }
        }
      });
      return { studentName: enrollment.student.fullName, className: enrollment.classRoom.name };
    });

    revalidateFinancialPaths();
    revalidateRosterPaths();
    return successState(
      `${names.studentName} nghỉ lớp ${names.className} từ ${formatMonth(fromMonth, fromYear).toLowerCase()}.`
    );
  } catch (leaveError) {
    return actionFailure(leaveError, "Không cho nghỉ lớp được.");
  }
}
