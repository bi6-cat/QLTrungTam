"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure, revalidateFinancialPaths, runSerializableAction } from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import { isEnrollmentActiveInPeriod } from "@/lib/enrollment-period";
import { changeInvoiceLifecycle, type InvoiceLifecycleStatus } from "@/lib/invoice-lifecycle";
import { buildMemo } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { safeParseForm, updateClassDetailsSchema } from "@/lib/validation";

function clampSessions(value: FormDataEntryValue | null) {
  const parsed = Math.floor(Number(String(value ?? "").replace(/[^\d.-]/g, "")));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(60, parsed);
}

// Không redirect sau khi lưu: redirect về chính URL đang xem dễ đua với request
// prefetch của <Link> và làm vùng nội dung trắng. revalidatePath đã gửi kèm dữ
// liệu mới trong response của action; client tự thoát chế độ sửa khi thành công.
export async function updateClassDetailsAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const actor = await requireAdmin();
  const { data: parsed, error } = safeParseForm(updateClassDetailsSchema, formData);
  if (error || !parsed) return errorState(error ?? "Dữ liệu không hợp lệ.");

  let summary: { created: number; updated: number; voided: number };
  try {
    summary = await saveClassDetails(parsed, formData, actor);
  } catch (saveError) {
    return actionFailure(saveError, "Không lưu được thay đổi.");
  }

  revalidateFinancialPaths();
  const parts = [
    summary.created > 0 ? `tạo ${summary.created} hóa đơn` : "",
    summary.updated > 0 ? `cập nhật ${summary.updated} học sinh` : "",
    summary.voided > 0 ? `hủy ${summary.voided} hóa đơn do bảo lưu` : ""
  ].filter(Boolean);
  return successState(parts.length > 0 ? `Đã ${parts.join(", ")}.` : "Đã lưu, không có thay đổi.");
}

async function saveClassDetails(
  parsed: { classId: string; month: number; year: number; intent: "create" | "save" },
  formData: FormData,
  actor: { userId: string; username: string }
) {
  const month = parsed.month || new Date().getMonth() + 1;
  const year = parsed.year || new Date().getFullYear();
  const periodEnd = new Date(year, month, 1);
  const enrollmentIds = Array.from(
    new Set(formData.getAll("enrollmentId").map((value) => String(value)).filter(Boolean))
  );

  return runSerializableAction(async (tx) => {
    const summary = { created: 0, updated: 0, voided: 0 };
    const classState = await tx.classRoom.findUnique({
      where: { id: parsed.classId },
      select: { archivedAt: true }
    });
    if (!classState) throw new Error("Không tìm thấy lớp học.");
    if (classState.archivedAt) throw new Error("Không thể tạo hoặc sửa kế hoạch tháng của lớp đã lưu trữ.");

    for (const enrollmentId of enrollmentIds) {
      const enrollment = await tx.enrollment.findUnique({
        where: { id: enrollmentId },
        include: {
          classRoom: true,
          student: true,
          months: { where: { month, year }, take: 1 },
          invoices: { where: { month, year }, take: 1 }
        }
      });
      if (
        !enrollment ||
        enrollment.classId !== parsed.classId ||
        enrollment.student.archivedAt ||
        !isEnrollmentActiveInPeriod(enrollment.leftAt, month, year)
      ) {
        continue;
      }

      const existingInvoice = enrollment.invoices[0];
      const existingMonth = enrollment.months[0];
      if (enrollment.startDate >= periodEnd && !existingMonth && !existingInvoice) {
        throw new Error(`${enrollment.student.fullName} chưa bắt đầu học lớp trong tháng ${month}/${year}.`);
      }
      if (existingInvoice && existingInvoice.status !== "unpaid") continue;

      const status = String(formData.get(`status:${enrollmentId}`)) === "on_leave" ? "on_leave" : "active";
      const requestedSessions = clampSessions(formData.get(`sessions:${enrollmentId}`));
      // Học sinh đang bảo lưu có số buổi bằng 0, nên ô nhập trên form cũng là 0.
      // Khi admin bật lại "Đang học" mà chưa kịp sửa số buổi thì tự khôi phục
      // mức mặc định thay vì chặn thao tác — admin sửa lại sau nếu cần.
      const fallbackSessions = enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault;
      const sessions = status === "active" ? (requestedSessions > 0 ? requestedSessions : fallbackSessions) : 0;
      const periodPricePerSession =
        existingMonth?.pricePerSession ?? existingInvoice?.pricePerSession ?? enrollment.classRoom.pricePerSession;

      const monthChanged =
        !existingMonth || existingMonth.status !== status || existingMonth.sessions !== sessions;
      await tx.enrollmentMonth.upsert({
        where: { enrollmentId_month_year: { enrollmentId, month, year } },
        update: { status, sessions },
        create: { enrollmentId, month, year, status, sessions, pricePerSession: periodPricePerSession }
      });

      // Tình trạng hiện hành của ghi danh = tình trạng của tháng có kế hoạch mới nhất,
      // để các tháng sau mặc định kế thừa đúng.
      const laterMonth = await tx.enrollmentMonth.findFirst({
        where: { enrollmentId, OR: [{ year: { gt: year } }, { year, month: { gt: month } }] },
        select: { id: true }
      });
      if (!laterMonth && enrollment.status !== status) {
        await tx.enrollment.update({ where: { id: enrollmentId }, data: { status } });
      }

      if (existingInvoice?.status === "unpaid" && status === "active") {
        if (existingInvoice.sessions !== sessions) {
          const updatedInvoice = await tx.monthlyInvoice.updateMany({
            where: {
              id: existingInvoice.id,
              status: "unpaid",
              transactionId: null,
              updatedAt: existingInvoice.updatedAt
            },
            data: { sessions, amount: sessions * existingInvoice.pricePerSession }
          });
          if (updatedInvoice.count !== 1) {
            throw new Error(`Hóa đơn của ${enrollment.student.fullName} vừa được thanh toán hoặc thay đổi. Vui lòng tải lại.`);
          }
          summary.updated += 1;
        }
      } else if (existingInvoice?.status === "unpaid" && status === "on_leave") {
        // Bảo lưu cả tháng: hủy hóa đơn chưa đóng để phụ huynh không còn bị đòi tiền.
        // Muốn học lại thì bấm "Khôi phục" hóa đơn, kế hoạch tháng tự về "Đang học".
        const voided = await tx.monthlyInvoice.updateMany({
          where: {
            id: existingInvoice.id,
            status: "unpaid",
            transactionId: null,
            paidAt: null,
            matchedTransaction: { is: null },
            updatedAt: existingInvoice.updatedAt
          },
          data: { status: "void", statusReason: "Bảo lưu", statusChangedAt: new Date() }
        });
        if (voided.count !== 1) {
          throw new Error(`Hóa đơn của ${enrollment.student.fullName} vừa thay đổi hoặc đang gắn giao dịch. Vui lòng tải lại.`);
        }
        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            actorUsername: actor.username.trim(),
            action: "invoice.voided",
            entityType: "MonthlyInvoice",
            entityId: existingInvoice.id,
            reason: "Bảo lưu",
            metadata: { previousStatus: "unpaid", targetStatus: "void", month, year }
          }
        });
        summary.voided += 1;
      } else if (!existingInvoice && parsed.intent === "create" && status === "active") {
        await tx.monthlyInvoice.create({
          data: {
            enrollmentId,
            month,
            year,
            sessions,
            pricePerSession: periodPricePerSession,
            amount: sessions * periodPricePerSession,
            memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month, year),
            studentNameSnapshot: enrollment.student.fullName,
            studentPhoneSnapshot: enrollment.student.phone,
            classNameSnapshot: enrollment.classRoom.name,
            classShortCodeSnapshot: enrollment.classRoom.shortCode,
            teacherNameSnapshot: enrollment.classRoom.teacherName
          }
        });
        summary.created += 1;
      } else if (monthChanged) {
        summary.updated += 1;
      }
    }
    return summary;
  });
}

const LIFECYCLE_TARGETS = new Set<InvoiceLifecycleStatus>(["unpaid", "void", "waived"]);
const LIFECYCLE_SUCCESS: Record<InvoiceLifecycleStatus, string> = {
  unpaid: "Đã khôi phục hóa đơn về chưa đóng.",
  void: "Đã hủy hóa đơn.",
  waived: "Đã miễn học phí cho hóa đơn."
};

export async function changeInvoiceStatusAction(
  invoiceId: string,
  targetStatus: InvoiceLifecycleStatus,
  reason: string
): Promise<ResultState> {
  const session = await requireAdmin();
  const trimmedReason = String(reason ?? "").trim();
  if (!LIFECYCLE_TARGETS.has(targetStatus)) return errorState("Trạng thái hóa đơn không hợp lệ.");
  if (trimmedReason.length > 500) return errorState("Lý do tối đa 500 ký tự.");

  try {
    await changeInvoiceLifecycle({
      invoiceId: String(invoiceId),
      targetStatus,
      reason: trimmedReason,
      actor: session
    });
  } catch (error) {
    return actionFailure(error, "Không thể đổi trạng thái hóa đơn.");
  }

  revalidateFinancialPaths();
  return successState(LIFECYCLE_SUCCESS[targetStatus]);
}
