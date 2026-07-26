import { z } from "zod";

// ---------------------------------------------------------------------------
// Các schema trường dùng lại.
// ---------------------------------------------------------------------------
const id = z.string().trim().min(1, "ID không hợp lệ").max(64);

const shortCode = z
  .string()
  .trim()
  .min(1, "Thiếu mã lớp")
  .max(20)
  .transform((v) => v.toUpperCase())
  .refine((v) => /^[A-Z0-9_-]+$/.test(v), "Mã lớp chỉ gồm chữ, số, _ hoặc -");

const phone = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 8 && v.length <= 12, "Số điện thoại phải có 8–12 chữ số");

const money = z.coerce
  .number({ message: "Phải là số" })
  .int("Phải là số nguyên")
  .min(0, "Không được âm")
  .max(1_000_000_000, "Giá trị quá lớn");

const sessionCount = z.coerce.number().int().min(0, "Số buổi không được âm").max(60, "Số buổi quá lớn");

// month/year: sai/thiếu -> 0 để action tự lấy mặc định theo thời điểm hiện tại.
const monthOpt = z.coerce.number().int().min(1).max(12).catch(0);
const yearOpt = z.coerce.number().int().min(2000).max(2100).catch(0);

const enrollmentStatus = z
  .string()
  .optional()
  .transform((v) => (v === "on_leave" ? "on_leave" : "active"));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null));

const requiredText = (label: string, max: number) => z.string().trim().min(1, label).max(max);

/** Tên người: gom khoảng trắng thừa để so trùng không bị lệch vì gõ 2 dấu cách. */
const personName = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, label)
    .max(max)
    .transform((v) => v.replace(/\s+/g, " "));

/** Giờ dạng HH:mm 24h. */
const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:mm (VD 18:00)");
const looseText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v ?? "");

// ---------------------------------------------------------------------------
// Schema theo từng action.
// ---------------------------------------------------------------------------
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200)
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Nhập mật khẩu hiện tại").max(200),
    newPassword: z.string().min(8, "Mật khẩu mới tối thiểu 8 ký tự").max(200),
    confirmPassword: z.string().max(200)
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp",
    path: ["confirmPassword"]
  });

export const createClassSchema = z.object({
  name: requiredText("Thiếu tên lớp", 120),
  shortCode,
  teacherName: looseText(120),
  pricePerSession: money,
  sessionsPerMonthDefault: z.coerce.number().int().min(1).max(60),
  teacherSharePercent: z.coerce
    .number({ message: "Phần trăm phải là số" })
    .int("Phần trăm phải là số nguyên")
    .min(0, "Phần trăm không được âm")
    .max(100, "Phần trăm tối đa là 100")
    .catch(0)
});

export const updateClassSchema = z.object({
  id,
  name: requiredText("Thiếu tên lớp", 120),
  teacherName: looseText(120),
  pricePerSession: money,
  sessionsPerMonthDefault: z.coerce.number().int().min(1).max(60),
  teacherSharePercent: z.coerce
    .number({ message: "Phần trăm phải là số" })
    .int("Phần trăm phải là số nguyên")
    .min(0, "Phần trăm không được âm")
    .max(100, "Phần trăm tối đa là 100")
    .catch(0)
});

export const idSchema = z.object({ id });

export const createStudentSchema = z.object({
  fullName: personName("Thiếu tên học sinh", 120),
  phone,
  address: looseText(300),
  parentName: optionalText(120),
  note: optionalText(1000)
});

export const updateStudentSchema = z.object({
  id,
  fullName: personName("Thiếu tên học sinh", 120),
  phone,
  address: looseText(300),
  parentName: optionalText(120),
  note: optionalText(1000)
});

export const createScheduleSchema = z.object({
  classId: id,
  weekday: z.coerce.number().int().min(1, "Chọn thứ").max(7, "Chọn thứ"),
  startTime: timeOfDay,
  endTime: timeOfDay,
  room: looseText(60),
  note: optionalText(200)
});

export const expenseSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  category: z
    .enum(["teacher_salary", "rent", "utilities", "supplies", "marketing", "other"])
    .catch("other"),
  classId: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  description: requiredText("Thiếu nội dung chi phí", 200),
  amount: money.refine((v) => v > 0, "Số tiền phải lớn hơn 0"),
  note: optionalText(500)
});

export const generateSalarySchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100)
});

export const enrollmentSchema = z
  .object({
    studentId: id,
    classId: id,
    sessionsOverride: z
      .string()
      .optional()
      .transform((v) => {
        const value = v?.trim() ?? "";
        if (!value) return null;
        return /^\d+$/.test(value) ? Number(value) : Number.NaN;
      })
      .refine(
        (v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 60),
        "Số buổi ghi đè không hợp lệ"
      ),
    status: enrollmentStatus
  })
  .superRefine((data, ctx) => {
    if (data.status === "active" && data.sessionsOverride === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sessionsOverride"],
        message: "Học sinh đang học phải có số buổi lớn hơn 0 hoặc để trống để dùng mặc định"
      });
    }
  });

export const updateEnrollmentStatusSchema = z.object({ id, status: enrollmentStatus });

export const generateInvoicesSchema = z.object({
  classId: id,
  month: monthOpt,
  year: yearOpt
});

export const updateInvoiceSchema = z.object({
  invoiceId: id,
  sessions: sessionCount,
  pricePerSession: money,
  amount: money.optional()
});

export const updateClassDetailsSchema = z.object({
  classId: id,
  month: monthOpt,
  year: yearOpt,
  intent: z
    .string()
    .optional()
    .transform((v) => (v === "create" ? "create" : "save"))
});

export const updateSettingsSchema = z.object({
  sepayApiKey: looseText(200),
  sepayWebhookSecret: looseText(200),
  bankAccountNumber: requiredText("Thiếu số tài khoản", 40),
  bankAccountName: requiredText("Thiếu tên tài khoản", 120),
  bankBin: requiredText("Thiếu mã ngân hàng", 20),
  appUrl: looseText(200)
});

export const markCashSchema = z.object({
  invoiceId: id,
  returnTo: looseText(300)
});

export const assignTransactionSchema = z.object({
  transactionId: id,
  invoiceId: id,
  allowAmountMismatch: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1" || value === "on"),
  reason: looseText(500)
});

export const resolveTransactionSchema = z.object({
  transactionId: id,
  reason: requiredText("Vui lòng nhập lý do xử lý giao dịch", 500)
});

export const unassignTransactionSchema = z.object({
  transactionId: id,
  reason: requiredText("Vui lòng nhập lý do bỏ gán", 500)
});

export const reverseTransactionSchema = z.object({
  transactionId: id,
  reason: requiredText("Vui lòng nhập lý do hoàn tác", 500)
});

// ---------------------------------------------------------------------------
// Helpers: FormData -> object -> parse.
// ---------------------------------------------------------------------------
function formToObject(formData: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key in obj) {
      const current = obj[key];
      if (Array.isArray(current)) current.push(value);
      else obj[key] = [current, value];
    } else {
      obj[key] = value;
    }
  }
  return obj;
}

/** Parse + validate, ném lỗi (dùng cho action trả về void). */
export function parseForm<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const result = schema.safeParse(formToObject(formData));
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Dữ liệu không hợp lệ: ${message}`);
  }
  return result.data;
}

/** Parse an toàn, trả về lỗi dạng chuỗi (dùng cho action có useActionState). */
export function safeParseForm<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData
): { data: z.infer<T>; error: null } | { data: null; error: string } {
  const result = schema.safeParse(formToObject(formData));
  if (!result.success) {
    return { data: null, error: result.error.issues.map((issue) => issue.message).join("; ") };
  }
  return { data: result.data, error: null };
}
