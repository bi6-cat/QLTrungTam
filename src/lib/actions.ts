"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, requireAdmin } from "@/lib/auth";
import {
  assignTransactionToInvoice,
  LedgerError,
  recordCashPayment,
  resolveUnmatchedTransaction,
  reverseTransaction,
  unassignTransaction
} from "@/lib/ledger";
import {
  changeInvoiceLifecycle,
  InvoiceLifecycleError,
  type InvoiceLifecycleStatus
} from "@/lib/invoice-lifecycle";
import { isEnrollmentActiveInPeriod, periodIndex, periodStartDate } from "@/lib/enrollment-period";
import { buildMemo } from "@/lib/payment";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { generatePublicToken } from "@/lib/publicToken";
import { checkRateLimit, recordFailure, resetLimit } from "@/lib/rate-limit";
import { saveAppSettings } from "@/lib/settings";
import type { z } from "zod";

const LOGIN_LIMIT = { max: 8, windowMs: 15 * 60 * 1000 };

async function getClientIp() {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip")?.trim() || "unknown";
}
import {
  assignTransactionSchema,
  changePasswordSchema,
  createClassSchema,
  createScheduleSchema,
  createStudentSchema,
  enrollmentSchema,
  expenseSchema,
  generateInvoicesSchema,
  generateSalarySchema,
  idSchema,
  loginSchema,
  parseForm,
  resolveTransactionSchema,
  reverseTransactionSchema,
  safeParseForm,
  unassignTransactionSchema,
  updateClassDetailsSchema,
  updateClassSchema,
  updateEnrollmentStatusSchema,
  updateInvoiceSchema,
  updateSettingsSchema,
  updateStudentSchema
} from "@/lib/validation";

function clampSessions(value: FormDataEntryValue | null) {
  const parsed = Math.floor(Number(String(value ?? "").replace(/[^\d.-]/g, "")));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(60, parsed);
}

const MAX_SERIALIZABLE_ACTION_ATTEMPTS = 3;

async function runSerializableAction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      const isWriteConflict =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (isWriteConflict && attempt < MAX_SERIALIZABLE_ACTION_ATTEMPTS) continue;
      if (isWriteConflict) {
        throw new Error("Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại và thử lại.");
      }
      throw error;
    }
  }

  throw new Error("Không thể hoàn tất thao tác do xung đột dữ liệu.");
}

type ArchiveEntity = "class" | "student";
type ArchiveMode = "archive" | "restore";

function parseArchiveInput(formData: FormData) {
  const { id } = parseForm(idSchema, formData);
  const rawReason = formData.get("reason");
  const reason = typeof rawReason === "string" ? rawReason.trim() : "";
  if (!reason || reason.length > 500) {
    throw new Error("Lý do phải có từ 1 đến 500 ký tự.");
  }
  return { id, reason };
}

async function changeArchiveState(input: {
  entity: ArchiveEntity;
  mode: ArchiveMode;
  id: string;
  reason: string;
  actor: { userId: string; username: string };
}) {
  return runSerializableAction(async (tx) => {
    const current =
      input.entity === "class"
        ? await tx.classRoom.findUnique({
            where: { id: input.id },
            select: { id: true, archivedAt: true }
          })
        : await tx.student.findUnique({
            where: { id: input.id },
            select: { id: true, archivedAt: true }
          });

    const entityLabel = input.entity === "class" ? "lớp học" : "học sinh";
    if (!current) throw new Error(`Không tìm thấy ${entityLabel}.`);
    if (input.mode === "archive" && current.archivedAt) {
      throw new Error(`${input.entity === "class" ? "Lớp học" : "Học sinh"} đã được lưu trữ.`);
    }
    if (input.mode === "restore" && !current.archivedAt) {
      throw new Error(`${input.entity === "class" ? "Lớp học" : "Học sinh"} đang hoạt động.`);
    }

    const nextArchivedAt = input.mode === "archive" ? new Date() : null;
    const changed =
      input.entity === "class"
        ? await tx.classRoom.updateMany({
            where: { id: current.id, archivedAt: current.archivedAt },
            data: { archivedAt: nextArchivedAt }
          })
        : await tx.student.updateMany({
            where: { id: current.id, archivedAt: current.archivedAt },
            data: { archivedAt: nextArchivedAt }
          });

    if (changed.count !== 1) {
      throw new Error(`${input.entity === "class" ? "Lớp học" : "Học sinh"} vừa được thay đổi. Vui lòng tải lại.`);
    }

    const entityType = input.entity === "class" ? "ClassRoom" : "Student";
    await tx.auditLog.create({
      data: {
        actorUserId: input.actor.userId,
        actorUsername: input.actor.username.trim(),
        action: `${input.entity}.${input.mode === "archive" ? "archived" : "restored"}`,
        entityType,
        entityId: current.id,
        reason: input.reason,
        metadata: {
          previousArchivedAt: current.archivedAt?.toISOString() ?? null,
          archivedAt: nextArchivedAt?.toISOString() ?? null
        }
      }
    });

    return { archivedAt: nextArchivedAt };
  });
}

function revalidateClassArchivePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/transactions");
  revalidatePath("/pay/[short_code]", "page");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

function revalidateStudentArchivePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/transactions");
  revalidatePath("/pay/[short_code]", "page");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

export async function loginAction(_prevState: { error: string }, formData: FormData) {
  const ip = await getClientIp();
  const rlKey = `login:${ip}`;
  const limit = checkRateLimit(rlKey, LOGIN_LIMIT);
  if (!limit.allowed) {
    return {
      error: `Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ${limit.retryAfterSec} giây.`
    };
  }

  const { data, error } = safeParseForm(loginSchema, formData);
  if (error || !data) {
    recordFailure(rlKey, LOGIN_LIMIT);
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };
  }
  const ok = await login(data.username, data.password);
  if (!ok) {
    recordFailure(rlKey, LOGIN_LIMIT);
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };
  }
  resetLimit(rlKey);
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function changePasswordAction(
  _prevState: { error: string; success: string },
  formData: FormData
) {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(changePasswordSchema, formData);
  if (error || !data) {
    return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };
  }

  const user = await prisma.adminUser.findUnique({ where: { id: session.userId } });
  if (!user || !verifyPassword(data.currentPassword, user.passwordHash)) {
    return { error: "Mật khẩu hiện tại không đúng.", success: "" };
  }

  await prisma.adminUser.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(data.newPassword) }
  });

  return { error: "", success: "Đã đổi mật khẩu thành công." };
}

export async function createClassAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(createClassSchema, formData);
  // Sinh mã công khai ngắn, thử lại nếu trùng; sau vài lần thì nới dài để chắc chắn.
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.classRoom.create({
        data: {
          name: data.name,
          shortCode: data.shortCode,
          teacherName: data.teacherName,
          pricePerSession: data.pricePerSession,
          sessionsPerMonthDefault: data.sessionsPerMonthDefault,
          teacherSharePercent: data.teacherSharePercent,
          publicToken: generatePublicToken(attempt < 10 ? undefined : 6)
        }
      });
      break;
    } catch (error) {
      const target = error instanceof Prisma.PrismaClientKnownRequestError ? (error.meta?.target as string[] | undefined) : undefined;
      const isTokenCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        Array.isArray(target) &&
        target.includes("publicToken");
      // Chỉ thử lại khi trùng publicToken; lỗi khác (vd trùng shortCode) ném ra ngoài.
      if (isTokenCollision && attempt < 25) continue;
      throw error;
    }
  }
  revalidatePath("/admin/classes");
}

export async function archiveClassAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "class", mode: "archive", id, reason, actor });
    revalidateClassArchivePaths();
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể lưu trữ lớp học." };
  }
}

export async function restoreClassAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "class", mode: "restore", id, reason, actor });
    revalidateClassArchivePaths();
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể khôi phục lớp học." };
  }
}

export type EditState = { error: string; ok: boolean };

export async function updateClassAction(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateClassSchema, formData);
  if (error || !data) {
    return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };
  }
  try {
    const updated = await prisma.classRoom.updateMany({
      where: { id: data.id, archivedAt: null },
      data: {
        name: data.name,
        teacherName: data.teacherName,
        pricePerSession: data.pricePerSession,
        sessionsPerMonthDefault: data.sessionsPerMonthDefault,
        teacherSharePercent: data.teacherSharePercent
      }
    });
    if (updated.count !== 1) {
      return { error: "Lớp đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục lớp trước khi sửa.", ok: false };
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Mã lớp đã tồn tại, hãy chọn mã khác.", ok: false };
    }
    throw e;
  }
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  return { error: "", ok: true };
}

// File này có "use server" nên chỉ được export async function; hằng số khởi tạo
// state phải nằm ở module khác (@/lib/action-states).
export type CreateStudentState = { error: string; warning: string; success: string };

/**
 * Thêm học sinh thủ công, chặn trùng hồ sơ.
 *
 * - Trùng cả tên lẫn SĐT  -> chặn hẳn (gần như chắc chắn là nhập lặp).
 * - Trùng ở hồ sơ đã lưu trữ -> chặn, hướng dẫn khôi phục thay vì tạo bản sao.
 * - Chỉ trùng SĐT (khác tên) -> vẫn tạo, kèm cảnh báo vì anh chị em dùng chung
 *   số phụ huynh là bình thường, nhưng cùng lớp thì memo sẽ đụng nhau.
 */
export async function createStudentAction(
  _prevState: CreateStudentState,
  formData: FormData
): Promise<CreateStudentState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createStudentSchema, formData);
  if (error || !data) {
    return { warning: "", success: "", error: error ?? "Dữ liệu không hợp lệ." };
  }

  const samePhone = await prisma.student.findMany({
    where: { phone: data.phone },
    select: { id: true, fullName: true, archivedAt: true },
    take: 20
  });

  const normalized = data.fullName.toLocaleLowerCase("vi");
  const duplicate = samePhone.find(
    (student) => student.fullName.toLocaleLowerCase("vi") === normalized
  );
  if (duplicate) {
    return {
      warning: "",
      success: "",
      error: duplicate.archivedAt
        ? `"${duplicate.fullName}" (${data.phone}) đã có trong hồ sơ lưu trữ. Hãy khôi phục hồ sơ đó thay vì tạo mới.`
        : `"${duplicate.fullName}" (${data.phone}) đã tồn tại. Không tạo thêm hồ sơ trùng.`
    };
  }

  const created = await prisma.student.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    },
    select: { fullName: true }
  });

  const activeSiblings = samePhone.filter((student) => !student.archivedAt);
  revalidatePath("/admin/students");
  return {
    error: "",
    success: `Đã thêm ${created.fullName}.`,
    warning:
      activeSiblings.length > 0
        ? `SĐT ${data.phone} đang dùng cho ${activeSiblings
            .map((student) => student.fullName)
            .join(", ")}. Nếu là anh chị em thì bình thường, nhưng tránh xếp chung một lớp vì nội dung chuyển khoản sẽ trùng nhau.`
        : ""
  };
}

export async function archiveStudentAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "student", mode: "archive", id, reason, actor });
    revalidateStudentArchivePaths();
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể lưu trữ học sinh." };
  }
}

export async function restoreStudentAction(formData: FormData) {
  const actor = await requireAdmin();
  try {
    const { id, reason } = parseArchiveInput(formData);
    await changeArchiveState({ entity: "student", mode: "restore", id, reason, actor });
    revalidateStudentArchivePaths();
    return { ok: true, error: "" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Không thể khôi phục học sinh." };
  }
}

export async function updateStudentAction(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  await requireAdmin();
  const { data, error } = safeParseForm(updateStudentSchema, formData);
  if (error || !data) {
    return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };
  }
  const updated = await prisma.student.updateMany({
    where: { id: data.id, archivedAt: null },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    }
  });
  if (updated.count !== 1) {
    return { error: "Học sinh đã lưu trữ hoặc không còn tồn tại. Hãy khôi phục hồ sơ trước khi sửa.", ok: false };
  }
  revalidatePath("/admin/students");
  revalidatePath("/admin/classes");
  return { error: "", ok: true };
}

export async function createEnrollmentAction(formData: FormData): Promise<EditState> {
  await requireAdmin();
  const { data, error } = safeParseForm(enrollmentSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };
  try {
    await addEnrollment(data);
  } catch (enrollError) {
    return actionErrorState(enrollError, "Không thêm được học sinh vào lớp.");
  }
  revalidatePath("/admin/classes");
  revalidatePath("/admin/students");
  return { error: "", ok: true };
}

async function addEnrollment(data: z.infer<typeof enrollmentSchema>) {
  await runSerializableAction(async (tx) => {
    const [student, classRoom] = await Promise.all([
      tx.student.findUnique({
        where: { id: data.studentId },
        select: { id: true, archivedAt: true }
      }),
      tx.classRoom.findUnique({
        where: { id: data.classId },
        select: { id: true, archivedAt: true }
      })
    ]);

    if (!student) throw new Error("Không tìm thấy học sinh.");
    if (!classRoom) throw new Error("Không tìm thấy lớp học.");
    if (student.archivedAt) throw new Error("Không thể ghi danh học sinh đã lưu trữ.");
    if (classRoom.archivedAt) throw new Error("Không thể ghi danh vào lớp đã lưu trữ.");

    await tx.enrollment.upsert({
      where: {
        studentId_classId: { studentId: data.studentId, classId: data.classId }
      },
      // Thêm lại học sinh đã nghỉ lớp: học tiếp từ tháng này.
      update: { sessionsOverride: data.sessionsOverride, status: data.status, leftAt: null },
      create: {
        studentId: data.studentId,
        classId: data.classId,
        sessionsOverride: data.sessionsOverride,
        status: data.status
      }
    });
  });
}

/** Lỗi nghiệp vụ (Error thường, tiếng Việt) trả nguyên văn; lỗi Prisma/hạ tầng thì ẩn chi tiết. */
function actionErrorState(error: unknown, fallback: string): EditState {
  if (error instanceof Error && !error.name.startsWith("PrismaClient")) {
    return { error: error.message, ok: false };
  }
  console.error(fallback, error);
  return { error: `${fallback} Vui lòng tải lại trang và thử lại.`, ok: false };
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
export async function leaveClassAction(input: LeaveClassInput): Promise<EditState> {
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
    return { error: "Tháng nghỉ không hợp lệ.", ok: false };
  }
  if (!reason || reason.length > 500) {
    return { error: "Nhập lý do nghỉ từ 1 đến 500 ký tự.", ok: false };
  }

  try {
    await runSerializableAction(async (tx) => {
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
      const affected = enrollment.invoices.filter(
        (invoice) => periodIndex(invoice.month, invoice.year) >= fromIndex
      );
      const paid = affected.find((invoice) => invoice.status === "paid");
      if (paid) {
        throw new Error(
          `${enrollment.student.fullName} đã đóng học phí tháng ${paid.month}/${paid.year}. ` +
            "Chọn nghỉ từ tháng sau, hoặc hoàn giao dịch đó trước."
        );
      }

      const changedAt = new Date();
      for (const invoice of affected.filter((item) => item.status === "unpaid")) {
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
            voidedInvoiceIds: affected.filter((item) => item.status === "unpaid").map((item) => item.id)
          }
        }
      });
    });
  } catch (leaveError) {
    return actionErrorState(leaveError, "Không cho nghỉ lớp được.");
  }

  revalidateFinancialPaths();
  revalidatePath("/admin/students", "layout");
  return { error: "", ok: true };
}

export async function updateEnrollmentStatusAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(updateEnrollmentStatusSchema, formData);
  await prisma.enrollment.update({
    where: { id: data.id },
    data: { status: data.status }
  });
  revalidatePath("/admin/classes");
}

export async function generateInvoicesAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(generateInvoicesSchema, formData);
  const month = data.month || new Date().getMonth() + 1;
  const year = data.year || new Date().getFullYear();
  const periodEnd = new Date(year, month, 1);

  await runSerializableAction(async (tx) => {
    const classState = await tx.classRoom.findUnique({
      where: { id: data.classId },
      select: { archivedAt: true }
    });
    if (!classState) throw new Error("Không tìm thấy lớp học.");
    if (classState.archivedAt) throw new Error("Không thể tạo hóa đơn cho lớp đã lưu trữ.");

    const enrollments = await tx.enrollment.findMany({
      where: {
        classId: data.classId,
        student: { archivedAt: null },
        OR: [
          { createdAt: { lt: periodEnd } },
          { months: { some: { month, year } } },
          { invoices: { some: { month, year } } }
        ]
      },
      include: {
        student: true,
        classRoom: true,
        months: { where: { month, year }, take: 1 },
        invoices: { where: { month, year }, take: 1 }
      }
    });

    for (const enrollment of enrollments) {
      const existingMonth = enrollment.months[0];
      const monthlyStatus = existingMonth?.status ?? enrollment.status;
      const sessions =
        monthlyStatus === "active"
          ? existingMonth?.sessions ?? enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault
          : 0;
      const pricePerSession = existingMonth?.pricePerSession ?? enrollment.classRoom.pricePerSession;

      if (!existingMonth) {
        await tx.enrollmentMonth.create({
          data: {
            enrollmentId: enrollment.id,
            month,
            year,
            status: monthlyStatus,
            sessions,
            pricePerSession
          }
        });
      }

      if (monthlyStatus !== "active" || enrollment.invoices[0]) continue;
      if (sessions <= 0) {
        throw new Error(`Số buổi của ${enrollment.student.fullName} phải lớn hơn 0 trước khi tạo hóa đơn.`);
      }

      await tx.monthlyInvoice.create({
        data: {
          enrollmentId: enrollment.id,
          month,
          year,
          sessions,
          pricePerSession,
          amount: sessions * pricePerSession,
          memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month, year),
          studentNameSnapshot: enrollment.student.fullName,
          studentPhoneSnapshot: enrollment.student.phone,
          classNameSnapshot: enrollment.classRoom.name,
          classShortCodeSnapshot: enrollment.classRoom.shortCode,
          teacherNameSnapshot: enrollment.classRoom.teacherName
        }
      });
    }
  });

  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
  redirect(`/admin/classes?classId=${data.classId}&month=${month}&year=${year}`);
}

export async function updateInvoiceAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(updateInvoiceSchema, formData);
  if (data.sessions <= 0) {
    throw new Error("Số buổi phải lớn hơn 0 đối với hóa đơn đang thu.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const invoice = await tx.monthlyInvoice.findUnique({
      where: { id: data.invoiceId },
      select: {
        id: true,
        enrollmentId: true,
        month: true,
        year: true,
        status: true,
        transactionId: true,
        updatedAt: true
      }
    });
    if (!invoice || invoice.status !== "unpaid" || invoice.transactionId) return 0;

    const result = await tx.monthlyInvoice.updateMany({
      where: {
        id: invoice.id,
        status: "unpaid",
        transactionId: null,
        updatedAt: invoice.updatedAt
      },
      data: {
        sessions: data.sessions,
        pricePerSession: data.pricePerSession,
        amount: data.sessions * data.pricePerSession
      }
    });
    if (result.count !== 1) return 0;

    await tx.enrollmentMonth.upsert({
      where: {
        enrollmentId_month_year: {
          enrollmentId: invoice.enrollmentId,
          month: invoice.month,
          year: invoice.year
        }
      },
      update: { status: "active", sessions: data.sessions, pricePerSession: data.pricePerSession },
      create: {
        enrollmentId: invoice.enrollmentId,
        month: invoice.month,
        year: invoice.year,
        status: "active",
        sessions: data.sessions,
        pricePerSession: data.pricePerSession
      }
    });
    return result.count;
  });
  if (updated !== 1) {
    throw new Error("Hóa đơn đã được thanh toán hoặc vừa thay đổi; không thể sửa số tiền.");
  }
  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
}

export type ClassDetailsActionState = { error: string; ok: boolean };

// Không redirect sau khi lưu: redirect về chính URL đang xem dễ đua với request
// prefetch của <Link> và làm vùng nội dung trắng. revalidatePath đã gửi kèm dữ
// liệu mới trong response của action; client tự thoát chế độ sửa khi ok.
export async function updateClassDetailsAction(
  _prevState: ClassDetailsActionState,
  formData: FormData
): Promise<ClassDetailsActionState> {
  const actor = await requireAdmin();
  const { data: parsed, error } = safeParseForm(updateClassDetailsSchema, formData);
  if (error || !parsed) return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };

  try {
    await saveClassDetails(parsed, formData, actor);
  } catch (saveError) {
    return actionErrorState(saveError, "Không lưu được thay đổi.");
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  return { error: "", ok: true };
}

async function saveClassDetails(
  parsed: z.infer<typeof updateClassDetailsSchema>,
  formData: FormData,
  actor: { userId: string; username: string }
) {
  const month = parsed.month || new Date().getMonth() + 1;
  const year = parsed.year || new Date().getFullYear();
  const periodEnd = new Date(year, month, 1);
  const enrollmentIds = Array.from(
    new Set(formData.getAll("enrollmentId").map((value) => String(value)).filter(Boolean))
  );

  await runSerializableAction(async (tx) => {
    const classState = await tx.classRoom.findUnique({
      where: { id: parsed.classId },
      select: { archivedAt: true }
    });
    if (!classState) throw new Error("Không tìm thấy lớp học.");
    if (classState.archivedAt) {
      throw new Error("Không thể tạo hoặc sửa kế hoạch tháng của lớp đã lưu trữ.");
    }

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
      if (enrollment.createdAt >= periodEnd && !existingMonth && !existingInvoice) {
        throw new Error(`${enrollment.student.fullName} chưa tham gia lớp trong tháng ${month}/${year}.`);
      }
      if (existingInvoice && existingInvoice.status !== "unpaid") {
        continue;
      }

      const status =
        String(formData.get(`status:${enrollmentId}`)) === "on_leave" ? "on_leave" : "active";
      const requestedSessions = clampSessions(formData.get(`sessions:${enrollmentId}`));
      // Học sinh đang bảo lưu có số buổi bằng 0, nên ô nhập trên form cũng là 0.
      // Khi admin bật lại "Đang học" mà chưa kịp sửa số buổi thì tự khôi phục
      // mức mặc định thay vì chặn thao tác — admin sửa lại sau nếu cần.
      const fallbackSessions =
        enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault;
      const sessions =
        status === "active" ? (requestedSessions > 0 ? requestedSessions : fallbackSessions) : 0;
      const periodPricePerSession =
        existingMonth?.pricePerSession ??
        existingInvoice?.pricePerSession ??
        enrollment.classRoom.pricePerSession;
      if (status === "active" && sessions <= 0) {
        throw new Error(
          `Không xác định được số buổi cho ${enrollment.student.fullName}. Hãy nhập số buổi lớn hơn 0.`
        );
      }

      await tx.enrollmentMonth.upsert({
        where: { enrollmentId_month_year: { enrollmentId, month, year } },
        update: { status, sessions },
        create: {
          enrollmentId,
          month,
          year,
          status,
          sessions,
          pricePerSession: periodPricePerSession
        }
      });

      if (existingInvoice?.status === "unpaid" && status === "active") {
        const updatedInvoice = await tx.monthlyInvoice.updateMany({
          where: {
            id: existingInvoice.id,
            status: "unpaid",
            transactionId: null,
            updatedAt: existingInvoice.updatedAt
          },
          data: {
            sessions,
            amount: sessions * existingInvoice.pricePerSession
          }
        });
        if (updatedInvoice.count !== 1) {
          throw new Error(`Hóa đơn của ${enrollment.student.fullName} vừa được thanh toán hoặc thay đổi. Vui lòng tải lại.`);
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
          throw new Error(
            `Hóa đơn của ${enrollment.student.fullName} vừa thay đổi hoặc đang gắn giao dịch. Vui lòng tải lại.`
          );
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
      }
    }
  });
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(updateSettingsSchema, formData);
  await saveAppSettings(data);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/debts");
  revalidatePath("/pay/[short_code]", "page");
}

// Import Excel lưu qua API route (payload lớn); sau đó client gọi action này thay cho
// router.refresh() để nhận dữ liệu mới trong response của action.
export async function refreshAfterStudentImportAction() {
  await requireAdmin();
  revalidatePath("/admin");
  revalidatePath("/admin/students");
  revalidatePath("/admin/classes");
}

export type InvoiceActionState = { error: string; ok: boolean };

function invoiceActionFailure(error: unknown, fallback: string): InvoiceActionState {
  if (error instanceof LedgerError || error instanceof InvoiceLifecycleError) {
    return { error: error.message, ok: false };
  }
  console.error(fallback, error);
  return { error: `${fallback} Vui lòng tải lại trang và thử lại.`, ok: false };
}

// Client gọi thẳng action thay vì fetch API rồi router.refresh(): revalidatePath trong
// action gửi kèm dữ liệu mới của trang hiện tại trong cùng response, không cần vẽ lại lần hai.
export async function recordCashPaymentAction(invoiceId: string): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  try {
    await recordCashPayment({ invoiceId: String(invoiceId), actor: session });
  } catch (error) {
    // Bấm lặp hóa đơn đã đóng không tạo thêm giao dịch; chỉ làm mới để thấy trạng thái thật.
    if (!(error instanceof LedgerError && error.code === "INVOICE_ALREADY_PAID")) {
      return invoiceActionFailure(error, "Không ghi nhận được tiền mặt.");
    }
  }

  revalidateFinancialPaths();
  return { error: "", ok: true };
}

const LIFECYCLE_TARGETS = new Set<InvoiceLifecycleStatus>(["unpaid", "void", "waived"]);

export async function changeInvoiceStatusAction(
  invoiceId: string,
  targetStatus: InvoiceLifecycleStatus,
  reason: string
): Promise<InvoiceActionState> {
  const session = await requireAdmin();
  const trimmedReason = String(reason ?? "").trim();
  if (!LIFECYCLE_TARGETS.has(targetStatus) || !trimmedReason || trimmedReason.length > 500) {
    return { error: "Chọn trạng thái và nhập lý do từ 1 đến 500 ký tự.", ok: false };
  }

  try {
    await changeInvoiceLifecycle({
      invoiceId: String(invoiceId),
      targetStatus,
      reason: trimmedReason,
      actor: session
    });
  } catch (error) {
    return invoiceActionFailure(error, "Không thể đổi trạng thái hóa đơn.");
  }

  revalidateFinancialPaths();
  return { error: "", ok: true };
}

export type TransactionActionState = { error: string; success: string };

function revalidateFinancialPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
  revalidatePath("/admin/transactions");
  revalidatePath("/pay/[short_code]", "page");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

function transactionActionFailure(error: unknown): TransactionActionState {
  if (error instanceof LedgerError) {
    return { error: error.message, success: "" };
  }
  console.error("Financial ledger action failed", error);
  return { error: "Không thể cập nhật giao dịch. Vui lòng tải lại trang và thử lại.", success: "" };
}

export async function assignTransactionAction(
  _prevState: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(assignTransactionSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };

  try {
    await assignTransactionToInvoice({
      transactionId: data.transactionId,
      invoiceId: data.invoiceId,
      actor: session,
      force: data.allowAmountMismatch,
      reason: data.reason
    });
    revalidateFinancialPaths();
    return { error: "", success: "Đã gán giao dịch và ghi nhận thanh toán." };
  } catch (ledgerError) {
    return transactionActionFailure(ledgerError);
  }
}

export async function resolveTransactionAction(
  _prevState: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(resolveTransactionSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };

  try {
    await resolveUnmatchedTransaction({
      transactionId: data.transactionId,
      actor: session,
      reason: data.reason
    });
    revalidateFinancialPaths();
    return { error: "", success: "Đã đánh dấu giao dịch là đã xử lý." };
  } catch (ledgerError) {
    return transactionActionFailure(ledgerError);
  }
}

export async function unassignTransactionAction(
  _prevState: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(unassignTransactionSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };

  try {
    await unassignTransaction({
      transactionId: data.transactionId,
      actor: session,
      reason: data.reason
    });
    revalidateFinancialPaths();
    return { error: "", success: "Đã bỏ gán; hóa đơn trở lại trạng thái chưa đóng." };
  } catch (ledgerError) {
    return transactionActionFailure(ledgerError);
  }
}

// ---------------------------------------------------------------------------
// Thời khoá biểu
// ---------------------------------------------------------------------------

function revalidateSchedulePaths() {
  revalidatePath("/admin/schedule");
  revalidatePath("/admin/classes");
  revalidatePath("/admin/finance");
  revalidatePath("/teacher/classes/[short_code]", "page");
}

export async function createScheduleAction(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  await requireAdmin();
  const { data, error } = safeParseForm(createScheduleSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };
  if (data.endTime <= data.startTime) {
    return { error: "Giờ kết thúc phải sau giờ bắt đầu.", ok: false };
  }

  const classRoom = await prisma.classRoom.findUnique({
    where: { id: data.classId },
    select: { archivedAt: true }
  });
  if (!classRoom) return { error: "Không tìm thấy lớp học.", ok: false };
  if (classRoom.archivedAt) return { error: "Không thể xếp lịch cho lớp đã lưu trữ.", ok: false };

  try {
    await prisma.classSchedule.create({
      data: {
        classId: data.classId,
        weekday: data.weekday,
        startTime: data.startTime,
        endTime: data.endTime,
        room: data.room,
        note: data.note
      }
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "Lớp này đã có buổi học trùng thứ và giờ bắt đầu.", ok: false };
    }
    throw e;
  }

  revalidateSchedulePaths();
  return { error: "", ok: true };
}

export async function deleteScheduleAction(formData: FormData) {
  await requireAdmin();
  const { id } = parseForm(idSchema, formData);
  await prisma.classSchedule.deleteMany({ where: { id } });
  revalidateSchedulePaths();
}

// ---------------------------------------------------------------------------
// Thu chi
// ---------------------------------------------------------------------------

function revalidateFinancePaths() {
  revalidatePath("/admin/finance");
  revalidatePath("/admin");
}

export async function createExpenseAction(
  _prevState: EditState,
  formData: FormData
): Promise<EditState> {
  await requireAdmin();
  const { data, error } = safeParseForm(expenseSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", ok: false };

  if (data.classId) {
    const exists = await prisma.classRoom.findUnique({
      where: { id: data.classId },
      select: { id: true }
    });
    if (!exists) return { error: "Không tìm thấy lớp học đã chọn.", ok: false };
  }

  await prisma.expense.create({
    data: {
      month: data.month,
      year: data.year,
      category: data.category,
      classId: data.classId,
      description: data.description,
      amount: data.amount,
      note: data.note
    }
  });

  revalidateFinancePaths();
  return { error: "", ok: true };
}

export async function deleteExpenseAction(formData: FormData) {
  await requireAdmin();
  const { id } = parseForm(idSchema, formData);
  await prisma.expense.deleteMany({ where: { id } });
  revalidateFinancePaths();
}

export type SalaryGenerationState = { error: string; success: string };

/**
 * Tạo bản ghi lương giáo viên cho tháng được chọn.
 *
 * Lương = % chia của lớp × học phí **đã thu**, gồm hai phần:
 * - Học phí kỳ này đã thu tới lúc chốt lương.
 * - "Thu muộn gộp": học phí các tháng trước đã chốt lương nhưng phụ huynh đóng sau đó.
 *
 * Mỗi hóa đơn đã tính được gắn vào bản ghi lương (salaryExpenseId) nên không bị trả
 * hai lần và không bị sót. Lớp đã có bản ghi lương trong tháng thì bỏ qua; xóa bản ghi
 * thì các hóa đơn của nó được tính lại ở lần bấm sau. Tháng chưa từng chốt lương không
 * bị gộp vào tháng sau — hãy chốt lương tháng đó trước.
 */
export async function generateTeacherSalaryAction(
  _prevState: SalaryGenerationState,
  formData: FormData
): Promise<SalaryGenerationState> {
  await requireAdmin();
  const { data, error } = safeParseForm(generateSalarySchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };

  const { month, year } = data;
  const currentIndex = periodIndex(month, year);

  try {
    const result = await runSerializableAction(async (tx) => {
      const [classes, salaryRecords] = await Promise.all([
        tx.classRoom.findMany({
          where: { teacherSharePercent: { gt: 0 } },
          select: {
            id: true,
            name: true,
            teacherName: true,
            teacherSharePercent: true,
            enrollments: {
              select: {
                invoices: {
                  where: {
                    status: "paid",
                    salaryExpenseId: null,
                    OR: [{ year: { lt: year } }, { year, month: { lte: month } }]
                  },
                  select: { id: true, month: true, year: true, amount: true }
                }
              }
            }
          }
        }),
        tx.expense.findMany({
          where: { category: "teacher_salary", classId: { not: null } },
          select: { classId: true, month: true, year: true }
        })
      ]);

      const closedPeriods = new Set(
        salaryRecords.map((row) => `${row.classId}:${periodIndex(row.month, row.year)}`)
      );
      const pending = classes.filter((classRoom) => !closedPeriods.has(`${classRoom.id}:${currentIndex}`));

      const rows = pending
        .map((classRoom) => {
          const invoices = classRoom.enrollments.flatMap((enrollment) => enrollment.invoices);
          const current = invoices.filter((invoice) => periodIndex(invoice.month, invoice.year) === currentIndex);
          // Chỉ gộp tiền của tháng đã chốt lương; tháng chưa chốt thì để chốt riêng.
          const late = invoices.filter((invoice) => {
            const index = periodIndex(invoice.month, invoice.year);
            return index < currentIndex && closedPeriods.has(`${classRoom.id}:${index}`);
          });
          const baseAmount = current.reduce((sum, invoice) => sum + invoice.amount, 0);
          const lateBaseAmount = late.reduce((sum, invoice) => sum + invoice.amount, 0);
          const amount = Math.round(((baseAmount + lateBaseAmount) * classRoom.teacherSharePercent) / 100);
          return { classRoom, invoiceIds: [...current, ...late].map((invoice) => invoice.id), baseAmount, lateBaseAmount, amount };
        })
        .filter((row) => row.amount > 0);

      for (const row of rows) {
        const teacher = row.classRoom.teacherName || "giáo viên";
        const expense = await tx.expense.create({
          data: {
            month,
            year,
            category: "teacher_salary",
            classId: row.classRoom.id,
            description:
              `Lương ${teacher} · ${row.classRoom.name} (${row.classRoom.teacherSharePercent}% đã thu` +
              (row.lateBaseAmount > 0 ? ", gồm thu muộn)" : ")"),
            amount: row.amount,
            sharePercent: row.classRoom.teacherSharePercent,
            baseAmount: row.baseAmount,
            lateBaseAmount: row.lateBaseAmount
          },
          select: { id: true }
        });
        const linked = await tx.monthlyInvoice.updateMany({
          where: { id: { in: row.invoiceIds }, status: "paid", salaryExpenseId: null },
          data: { salaryExpenseId: expense.id }
        });
        if (linked.count !== row.invoiceIds.length) {
          throw new Error("Dữ liệu học phí vừa thay đổi trong lúc tính lương. Vui lòng bấm lại.");
        }
      }

      return { classCount: classes.length, pendingCount: pending.length, rows };
    });

    if (result.rows.length === 0) {
      let reason: string;
      if (result.classCount === 0) {
        reason = "Chưa lớp nào khai % chia cho giáo viên. Vào Lớp học → Sửa lớp để nhập.";
      } else if (result.pendingCount === 0) {
        reason = "Tất cả lớp đã có bản ghi lương trong tháng này. Tiền thu thêm sẽ gộp vào lương tháng sau.";
      } else {
        reason = `Chưa thu được học phí nào cho tháng ${month}/${year} nên chưa có cơ sở tính lương.`;
      }
      return { error: reason, success: "" };
    }

    revalidateFinancePaths();
    const total = result.rows.reduce((sum, row) => sum + row.amount, 0);
    const lateTotal = result.rows.reduce((sum, row) => sum + row.lateBaseAmount, 0);
    return {
      error: "",
      success:
        `Đã tạo ${result.rows.length} bản ghi lương cho tháng ${month}/${year}, tổng ${total.toLocaleString("vi-VN")}đ` +
        (lateTotal > 0 ? ` (có gộp ${lateTotal.toLocaleString("vi-VN")}đ học phí tháng trước thu muộn).` : ".")
    };
  } catch (salaryError) {
    const state = actionErrorState(salaryError, "Không tính được lương.");
    return { error: state.error, success: "" };
  }
}

export async function reverseTransactionAction(
  _prevState: TransactionActionState,
  formData: FormData
): Promise<TransactionActionState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(reverseTransactionSchema, formData);
  if (error || !data) return { error: error ?? "Dữ liệu không hợp lệ.", success: "" };

  try {
    await reverseTransaction({
      transactionId: data.transactionId,
      actor: session,
      reason: data.reason
    });
    revalidateFinancialPaths();
    return { error: "", success: "Đã hoàn tác giao dịch và giữ lại lịch sử đối soát." };
  } catch (ledgerError) {
    return transactionActionFailure(ledgerError);
  }
}
