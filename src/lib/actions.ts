"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login, logout, requireAdmin } from "@/lib/auth";
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
  safeParseForm,
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

  const enrollments = await prisma.enrollment.findMany({
    where: { classId: data.classId, status: "active" },
    include: { student: true, classRoom: true }
  });

  for (const enrollment of enrollments) {
    const sessions = enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault;
    const memoContent = buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month, year);
    await prisma.monthlyInvoice.upsert({
      where: { enrollmentId_month_year: { enrollmentId: enrollment.id, month, year } },
      update: { memoContent },
      create: {
        enrollmentId: enrollment.id,
        month,
        year,
        sessions,
        pricePerSession: enrollment.classRoom.pricePerSession,
        amount: sessions * enrollment.classRoom.pricePerSession,
        memoContent
      }
    });
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
  redirect(`/admin/classes?classId=${data.classId}&month=${month}&year=${year}`);
}

export async function updateInvoiceAction(formData: FormData) {
  await requireAdmin();
  const data = parseForm(updateInvoiceSchema, formData);
  await prisma.monthlyInvoice.update({
    where: { id: data.invoiceId },
    data: {
      sessions: data.sessions,
      pricePerSession: data.pricePerSession,
      amount: data.amount ?? data.sessions * data.pricePerSession
    }
  });
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
      const existingInvoice = await tx.monthlyInvoice.findUnique({
        where: { enrollmentId_month_year: { enrollmentId, month, year } }
      });

      if (existingInvoice?.status === "paid") {
        continue;
      }

      const status =
        String(formData.get(`status:${enrollmentId}`)) === "on_leave" ? "on_leave" : "active";
      const sessions = clampSessions(formData.get(`sessions:${enrollmentId}`));
      const enrollment = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status, sessionsOverride: sessions > 0 ? sessions : null },
        include: { classRoom: true, student: true }
      });

      if (existingInvoice) {
        await tx.monthlyInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            sessions,
            amount: sessions * existingInvoice.pricePerSession,
            memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month, year)
          }
        });
      } else if (parsed.intent === "create" && status === "active") {
        await tx.monthlyInvoice.create({
          data: {
            enrollmentId,
            month,
            year,
            sessions,
            pricePerSession: enrollment.classRoom.pricePerSession,
            amount: sessions * enrollment.classRoom.pricePerSession,
            memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month, year)
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
  await requireAdmin();
  const { invoiceId, returnTo } = parseForm(markCashSchema, formData);
  const invoice = await prisma.monthlyInvoice.findUnique({
    where: { id: invoiceId },
    include: { enrollment: { include: { student: true, classRoom: true } } }
  });

  if (!invoice || invoice.status === "paid") {
    revalidatePath("/admin/classes");
    revalidatePath("/admin/transactions");
    if (returnTo.startsWith("/admin/classes")) {
      redirect(returnTo);
    }
    return;
  }

  const paidAt = new Date();
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.monthlyInvoice.updateMany({
      where: { id: invoice.id, status: "unpaid" },
      data: { status: "paid", paidAt }
    });
    if (claimed.count === 0) return;

    const transaction = await tx.transaction.create({
      data: {
        gatewayRef: `CASH-${invoice.id}-${paidAt.getTime()}`,
        amount: invoice.amount,
        rawContent: `Thu tiền mặt: ${invoice.enrollment.student.fullName} - ${invoice.enrollment.classRoom.shortCode} - T${invoice.month}/${invoice.year}`,
        transferredAt: paidAt,
        matchedInvoiceId: invoice.id,
        rawPayload: { method: "cash", source: "admin_manual", invoiceId: invoice.id }
      }
    });
    await tx.monthlyInvoice.update({
      where: { id: invoice.id },
      data: { transactionId: transaction.id }
    });
  });

  revalidatePath("/admin/classes");
  revalidatePath("/admin/transactions");
  revalidatePath("/pay/[short_code]", "page");
  if (returnTo.startsWith("/admin/classes")) {
    redirect(returnTo);
  }
}

export async function assignTransactionAction(formData: FormData) {
  await requireAdmin();
  const { transactionId, invoiceId } = parseForm(assignTransactionSchema, formData);
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { matchedInvoiceId: invoiceId }
    }),
    prisma.monthlyInvoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: new Date(), transactionId }
    })
  ]);
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/classes");
}

export async function resolveTransactionAction(formData: FormData) {
  await requireAdmin();
  const { transactionId } = parseForm(resolveTransactionSchema, formData);
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { resolvedAt: new Date() }
  });
  revalidatePath("/admin/transactions");
}
