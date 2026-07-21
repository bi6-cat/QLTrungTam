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
import { buildMemo } from "@/lib/payment";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { generatePublicToken } from "@/lib/publicToken";
import { checkRateLimit, recordFailure, resetLimit } from "@/lib/rate-limit";
import { saveAppSettings } from "@/lib/settings";

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
  createStudentSchema,
  enrollmentSchema,
  generateInvoicesSchema,
  idSchema,
  loginSchema,
  markCashSchema,
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

export async function deleteClassAction(formData: FormData) {
  await requireAdmin();
  const { id } = parseForm(idSchema, formData);
  const [invoiceCount, monthCount] = await Promise.all([
    prisma.monthlyInvoice.count({ where: { enrollment: { classId: id } } }),
    prisma.enrollmentMonth.count({ where: { enrollment: { classId: id } } })
  ]);
  if (invoiceCount > 0 || monthCount > 0) {
    throw new Error("Không thể xóa lớp đã có lịch sử theo tháng. Hãy lưu trữ lớp để giữ dữ liệu.");
  }
  await prisma.classRoom.delete({ where: { id } });
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
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
    await prisma.classRoom.update({
      where: { id: data.id },
      data: {
        name: data.name,
        teacherName: data.teacherName,
        pricePerSession: data.pricePerSession,
        sessionsPerMonthDefault: data.sessionsPerMonthDefault
      }
    });
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

export async function createStudentAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(createStudentSchema, formData);
  await prisma.student.create({
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    }
  });
  revalidatePath("/admin/students");
}

export async function deleteStudentAction(formData: FormData) {
  await requireAdmin();
  const { id } = parseForm(idSchema, formData);
  const [invoiceCount, monthCount] = await Promise.all([
    prisma.monthlyInvoice.count({ where: { enrollment: { studentId: id } } }),
    prisma.enrollmentMonth.count({ where: { enrollment: { studentId: id } } })
  ]);
  if (invoiceCount > 0 || monthCount > 0) {
    throw new Error("Không thể xóa học sinh đã có lịch sử theo tháng. Hãy lưu trữ hồ sơ để giữ dữ liệu.");
  }
  await prisma.student.delete({ where: { id } });
  revalidatePath("/admin/students");
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
  await prisma.student.update({
    where: { id: data.id },
    data: {
      fullName: data.fullName,
      phone: data.phone,
      address: data.address,
      parentName: data.parentName,
      note: data.note
    }
  });
  revalidatePath("/admin/students");
  revalidatePath("/admin/classes");
  return { error: "", ok: true };
}

export async function createEnrollmentAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(enrollmentSchema, formData);
  await prisma.enrollment.upsert({
    where: {
      studentId_classId: { studentId: data.studentId, classId: data.classId }
    },
    update: { sessionsOverride: data.sessionsOverride, status: data.status },
    create: {
      studentId: data.studentId,
      classId: data.classId,
      sessionsOverride: data.sessionsOverride,
      status: data.status
    }
  });
  revalidatePath("/admin/classes");
  revalidatePath("/admin/students");
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

  await prisma.$transaction(async (tx) => {
    const enrollments = await tx.enrollment.findMany({
      where: { classId: data.classId },
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

export async function updateClassDetailsAction(formData: FormData) {
  await requireAdmin();
  const parsed = parseForm(updateClassDetailsSchema, formData);
  const month = parsed.month || new Date().getMonth() + 1;
  const year = parsed.year || new Date().getFullYear();
  const enrollmentIds = Array.from(
    new Set(formData.getAll("enrollmentId").map((value) => String(value)).filter(Boolean))
  );

  await prisma.$transaction(async (tx) => {
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
      if (!enrollment || enrollment.classId !== parsed.classId) continue;

      const existingInvoice = enrollment.invoices[0];
      if (existingInvoice && existingInvoice.status !== "unpaid") {
        continue;
      }

      const status =
        String(formData.get(`status:${enrollmentId}`)) === "on_leave" ? "on_leave" : "active";
      const requestedSessions = clampSessions(formData.get(`sessions:${enrollmentId}`));
      const sessions = status === "active" ? requestedSessions : 0;
      const periodPricePerSession =
        enrollment.months[0]?.pricePerSession ??
        existingInvoice?.pricePerSession ??
        enrollment.classRoom.pricePerSession;
      if (status === "active" && sessions <= 0) {
        throw new Error(`Số buổi của ${enrollment.student.fullName} phải lớn hơn 0.`);
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

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  redirect(`/admin/classes?classId=${parsed.classId}&month=${month}&year=${year}`);
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(updateSettingsSchema, formData);
  await saveAppSettings(data);
  revalidatePath("/admin/settings");
  revalidatePath("/pay/[short_code]", "page");
}

export async function markInvoiceCashPaidAction(formData: FormData) {
  const session = await requireAdmin();
  const { invoiceId, returnTo } = parseForm(markCashSchema, formData);
  try {
    await recordCashPayment({ invoiceId, actor: session });
  } catch (error) {
    // Giữ tính idempotent cho form cũ: bấm lặp hóa đơn đã đóng không tạo thêm giao dịch.
    if (!(error instanceof LedgerError && error.code === "INVOICE_ALREADY_PAID")) {
      throw error;
    }
  }

  revalidateFinancialPaths();
  if (returnTo.startsWith("/admin/classes")) {
    redirect(returnTo);
  }
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
