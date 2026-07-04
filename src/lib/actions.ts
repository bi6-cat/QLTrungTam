"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { login, logout, requireAdmin } from "@/lib/auth";
import { toInt, toText } from "@/lib/format";
import { buildMemo } from "@/lib/payment";
import { prisma } from "@/lib/prisma";
import { saveAppSettings } from "@/lib/settings";

export async function loginAction(_prevState: { error: string }, formData: FormData) {
  const username = toText(formData.get("username"));
  const password = toText(formData.get("password"));
  const ok = await login(username, password);
  if (!ok) {
    return { error: "Sai tên đăng nhập hoặc mật khẩu." };
  }
  redirect("/admin");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function createClassAction(formData: FormData) {
  await requireAdmin();
  await prisma.classRoom.create({
    data: {
      name: toText(formData.get("name")),
      shortCode: toText(formData.get("shortCode")).toUpperCase(),
      teacherName: toText(formData.get("teacherName")),
      pricePerSession: toInt(formData.get("pricePerSession")),
      sessionsPerMonthDefault: toInt(formData.get("sessionsPerMonthDefault"), 8)
    }
  });
  revalidatePath("/admin/classes");
}

export async function deleteClassAction(formData: FormData) {
  await requireAdmin();
  await prisma.classRoom.delete({ where: { id: toText(formData.get("id")) } });
  revalidatePath("/admin/classes");
  revalidatePath("/admin");
}

export async function createStudentAction(formData: FormData) {
  await requireAdmin();
  await prisma.student.create({
    data: {
      fullName: toText(formData.get("fullName")),
      phone: toText(formData.get("phone")).replace(/\D/g, ""),
      address: toText(formData.get("address")),
      parentName: toText(formData.get("parentName")) || null,
      note: toText(formData.get("note")) || null
    }
  });
  revalidatePath("/admin/students");
}

export async function deleteStudentAction(formData: FormData) {
  await requireAdmin();
  await prisma.student.delete({ where: { id: toText(formData.get("id")) } });
  revalidatePath("/admin/students");
}

export async function createEnrollmentAction(formData: FormData) {
  await requireAdmin();
  await prisma.enrollment.upsert({
    where: {
      studentId_classId: {
        studentId: toText(formData.get("studentId")),
        classId: toText(formData.get("classId"))
      }
    },
    update: {
      sessionsOverride: formData.get("sessionsOverride")
        ? toInt(formData.get("sessionsOverride"))
        : null,
      status: toText(formData.get("status")) === "on_leave" ? "on_leave" : "active"
    },
    create: {
      studentId: toText(formData.get("studentId")),
      classId: toText(formData.get("classId")),
      sessionsOverride: formData.get("sessionsOverride")
        ? toInt(formData.get("sessionsOverride"))
        : null,
      status: toText(formData.get("status")) === "on_leave" ? "on_leave" : "active"
    }
  });
  revalidatePath("/admin/classes");
  revalidatePath("/admin/students");
}

export async function updateEnrollmentStatusAction(formData: FormData) {
  await requireAdmin();
  await prisma.enrollment.update({
    where: { id: toText(formData.get("id")) },
    data: { status: toText(formData.get("status")) === "on_leave" ? "on_leave" : "active" }
  });
  revalidatePath("/admin/classes");
}

export async function generateInvoicesAction(formData: FormData) {
  await requireAdmin();
  const classId = toText(formData.get("classId"));
  const month = toInt(formData.get("month"), new Date().getMonth() + 1);
  const year = toInt(formData.get("year"), new Date().getFullYear());
  const enrollments = await prisma.enrollment.findMany({
    where: { classId, status: "active" },
    include: { student: true, classRoom: true }
  });

  for (const enrollment of enrollments) {
    const sessions = enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault;
    await prisma.monthlyInvoice.upsert({
      where: { enrollmentId_month_year: { enrollmentId: enrollment.id, month, year } },
      update: {},
      create: {
        enrollmentId: enrollment.id,
        month,
        year,
        sessions,
        pricePerSession: enrollment.classRoom.pricePerSession,
        amount: sessions * enrollment.classRoom.pricePerSession,
        memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month)
      }
    });
  }

  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
  redirect(`/admin/classes?classId=${classId}&month=${month}&year=${year}`);
}

export async function updateInvoiceAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = toText(formData.get("invoiceId"));
  const sessions = toInt(formData.get("sessions"));
  const pricePerSession = toInt(formData.get("pricePerSession"));
  await prisma.monthlyInvoice.update({
    where: { id: invoiceId },
    data: {
      sessions,
      pricePerSession,
      amount: toInt(formData.get("amount"), sessions * pricePerSession)
    }
  });
  revalidatePath("/admin/classes");
  revalidatePath("/admin/invoices");
}

export async function updateClassDetailsAction(formData: FormData) {
  await requireAdmin();
  const classId = toText(formData.get("classId"));
  const month = toInt(formData.get("month"), new Date().getMonth() + 1);
  const year = toInt(formData.get("year"), new Date().getFullYear());
  const intent = toText(formData.get("intent")) === "create" ? "create" : "save";
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

      const status = toText(formData.get(`status:${enrollmentId}`)) === "on_leave" ? "on_leave" : "active";
      const sessions = toInt(formData.get(`sessions:${enrollmentId}`));
      const enrollment = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: {
          status,
          sessionsOverride: sessions > 0 ? sessions : null
        },
        include: { classRoom: true, student: true }
      });

      if (existingInvoice) {
        await tx.monthlyInvoice.update({
          where: { id: existingInvoice.id },
          data: {
            sessions,
            amount: sessions * existingInvoice.pricePerSession
          }
        });
      } else if (intent === "create" && status === "active") {
        await tx.monthlyInvoice.create({
          data: {
            enrollmentId,
            month,
            year,
            sessions,
            pricePerSession: enrollment.classRoom.pricePerSession,
            amount: sessions * enrollment.classRoom.pricePerSession,
            memoContent: buildMemo(enrollment.classRoom.shortCode, enrollment.student.phone, month)
          }
        });
      }
    }
  });

  revalidatePath("/admin/classes");
  revalidatePath("/admin");
  redirect(`/admin/classes?classId=${classId}&month=${month}&year=${year}`);
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  await saveAppSettings({
    sepayApiKey: toText(formData.get("sepayApiKey")),
    sepayWebhookSecret: toText(formData.get("sepayWebhookSecret")),
    bankAccountNumber: toText(formData.get("bankAccountNumber")),
    bankAccountName: toText(formData.get("bankAccountName")),
    bankBin: toText(formData.get("bankBin")),
    appUrl: toText(formData.get("appUrl"))
  });
  revalidatePath("/admin/settings");
  revalidatePath("/pay/[short_code]", "page");
}

export async function markInvoicePaidForTestAction(formData: FormData) {
  const invoiceId = toText(formData.get("invoiceId"));
  await prisma.monthlyInvoice.update({
    where: { id: invoiceId },
    data: { status: "paid", paidAt: new Date() }
  });
  revalidatePath("/pay/[short_code]", "page");
}

export async function markInvoiceCashPaidAction(formData: FormData) {
  await requireAdmin();
  const invoiceId = toText(formData.get("invoiceId"));
  const returnTo = toText(formData.get("returnTo"));
  const invoice = await prisma.monthlyInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      enrollment: {
        include: {
          student: true,
          classRoom: true
        }
      }
    }
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
  const transaction = await prisma.transaction.create({
    data: {
      gatewayRef: `CASH-${invoice.id}-${paidAt.getTime()}`,
      amount: invoice.amount,
      rawContent: `Thu tiền mặt: ${invoice.enrollment.student.fullName} - ${invoice.enrollment.classRoom.shortCode} - T${invoice.month}/${invoice.year}`,
      transferredAt: paidAt,
      matchedInvoiceId: invoice.id,
      rawPayload: {
        method: "cash",
        source: "admin_manual",
        invoiceId: invoice.id
      }
    }
  });

  await prisma.monthlyInvoice.update({
    where: { id: invoice.id },
    data: {
      status: "paid",
      paidAt,
      transactionId: transaction.id
    }
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
  const transactionId = toText(formData.get("transactionId"));
  const invoiceId = toText(formData.get("invoiceId"));
  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { matchedInvoiceId: invoiceId }
    }),
    prisma.monthlyInvoice.update({
      where: { id: invoiceId },
      data: { status: "paid", paidAt: new Date(), transactionId: transactionId }
    })
  ]);
  revalidatePath("/admin/transactions");
  revalidatePath("/admin/classes");
}
