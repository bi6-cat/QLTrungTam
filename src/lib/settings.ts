import { prisma } from "@/lib/prisma";
import { DEFAULT_SALARY_CUTOFF_CODE, SALARY_CUTOFF_SETTING_KEY } from "@/lib/salary-cutoff";

export const DEFAULT_DEBT_REMINDER_TEMPLATE = `Kính gửi phụ huynh em {{studentName}},
{{centerName}} nhắc học phí chưa đóng:
{{debtDetails}}
Tổng: {{totalAmount}}
{{paymentSection}}
Nếu đã chuyển khoản, phụ huynh vui lòng bỏ qua tin này. Liên hệ: {{centerPhone}}. Cảm ơn phụ huynh!`;

export type AppSettings = {
  sepayApiKey: string;
  sepayWebhookSecret: string;
  /** STK, tên TK, BIN và địa chỉ app chỉ đọc từ .env (xem readBankEnv), không sửa được trên web. */
  bankAccountNumber: string;
  bankAccountName: string;
  bankBin: string;
  appUrl: string;
  debtReminderTemplate: string;
  /** Ngày chốt lương chung, xem salary-cutoff.ts. */
  salaryCutoff: string;
};

/** Phần cài đặt còn sửa được trên trang Cài đặt (lưu trong bảng AppSetting). */
export type EditableAppSettings = Pick<AppSettings, "sepayApiKey" | "sepayWebhookSecret" | "debtReminderTemplate" | "salaryCutoff">;

const settingKeys: Record<keyof EditableAppSettings, string> = {
  sepayApiKey: "SEPAY_API_KEY",
  sepayWebhookSecret: "SEPAY_WEBHOOK_SECRET",
  debtReminderTemplate: "DEBT_REMINDER_TEMPLATE",
  salaryCutoff: SALARY_CUTOFF_SETTING_KEY
};

const defaults: EditableAppSettings = {
  sepayApiKey: process.env.SEPAY_API_KEY || "",
  sepayWebhookSecret: process.env.SEPAY_WEBHOOK_SECRET || "",
  debtReminderTemplate: process.env.DEBT_REMINDER_TEMPLATE || DEFAULT_DEBT_REMINDER_TEMPLATE,
  salaryCutoff: DEFAULT_SALARY_CUTOFF_CODE
};

// Đọc env lúc chạy qua biến trung gian: Next.js thay sẵn `process.env.NEXT_PUBLIC_*` viết thẳng
// lúc build, mà image build không có .env.
const runtimeEnv: Record<string, string | undefined> = process.env;

export type BankEnv = {
  bankAccountNumber: string;
  bankAccountName: string;
  bankBin: string;
  appUrl: string;
  /** Tên biến .env đang thiếu hoặc sai định dạng; rỗng = dùng được. */
  problems: string[];
};

/**
 * Tài khoản nhận học phí. Cố ý chỉ lấy từ .env trên máy chủ, không lưu DB, không có ô sửa trên
 * web: ai chiếm được tài khoản admin cũng không đổi được STK trên mã QR hay link trong tin nhắc nợ.
 * Sai định dạng thì coi như chưa cấu hình (không hiện QR) thay vì dùng một giá trị lạ.
 */
export function readBankEnv(): BankEnv {
  const problems: string[] = [];
  const pick = (name: string, valid: (value: string) => boolean) => {
    const value = (runtimeEnv[name] ?? "").trim();
    if (!value || !valid(value)) {
      problems.push(name);
      return "";
    }
    return value;
  };
  const bankAccountNumber = pick("BANK_ACCOUNT_NUMBER", (value) => /^\d{6,19}$/.test(value));
  const bankBin = pick("BANK_BIN", (value) => /^\d{6}$/.test(value));
  const bankAccountName = pick("BANK_ACCOUNT_NAME", (value) => value.length <= 120);
  const appUrl = pick("NEXT_PUBLIC_APP_URL", (value) => /^https?:\/\/[^\s/?#]+$/.test(value.replace(/\/$/, ""))).replace(/\/$/, "");
  return { bankAccountNumber, bankAccountName, bankBin, appUrl, problems };
}

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(settingKeys) } } });
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const bank = readBankEnv();

  return {
    sepayApiKey: byKey.get(settingKeys.sepayApiKey) ?? defaults.sepayApiKey,
    sepayWebhookSecret: byKey.get(settingKeys.sepayWebhookSecret) ?? defaults.sepayWebhookSecret,
    bankAccountNumber: bank.bankAccountNumber,
    bankAccountName: bank.bankAccountName,
    bankBin: bank.bankBin,
    appUrl: bank.appUrl,
    debtReminderTemplate:
      byKey.get(settingKeys.debtReminderTemplate) ?? defaults.debtReminderTemplate,
    salaryCutoff: byKey.get(settingKeys.salaryCutoff) ?? defaults.salaryCutoff
  };
}

/** Che secret để hiển thị: chỉ để lộ 4 ký tự cuối. Chuỗi rỗng = chưa cấu hình. */
export function maskSecret(value: string) {
  if (!value) return "";
  return `••••${value.length > 8 ? value.slice(-4) : ""}`;
}

export async function saveAppSettings(settings: EditableAppSettings) {
  await prisma.$transaction(
    Object.entries(settingKeys).map(([field, key]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: settings[field as keyof EditableAppSettings] },
        create: { key, value: settings[field as keyof EditableAppSettings] }
      })
    )
  );
}
