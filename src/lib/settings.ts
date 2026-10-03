import { prisma } from "@/lib/prisma";
import { DEFAULT_SALARY_CUTOFF_CODE, SALARY_CUTOFF_SETTING_KEY } from "@/lib/salary-cutoff";

export const DEFAULT_DEBT_REMINDER_TEMPLATE = `Kính gửi phụ huynh em {{studentName}},

{{centerName}} xin thông báo khoản học phí chưa hoàn thành:
{{debtDetails}}

Tổng cộng: {{totalAmount}}
{{paymentSection}}

Nếu phụ huynh đã chuyển khoản, xin bỏ qua tin nhắn này. Mọi thắc mắc xin liên hệ {{centerPhone}}.
Trân trọng cảm ơn!`;

export type AppSettings = {
  sepayApiKey: string;
  sepayWebhookSecret: string;
  bankAccountNumber: string;
  bankAccountName: string;
  bankBin: string;
  appUrl: string;
  debtReminderTemplate: string;
  /** Ngày chốt lương chung, xem salary-cutoff.ts. */
  salaryCutoff: string;
};

const settingKeys: Record<keyof AppSettings, string> = {
  sepayApiKey: "SEPAY_API_KEY",
  sepayWebhookSecret: "SEPAY_WEBHOOK_SECRET",
  bankAccountNumber: "BANK_ACCOUNT_NUMBER",
  bankAccountName: "BANK_ACCOUNT_NAME",
  bankBin: "BANK_BIN",
  appUrl: "NEXT_PUBLIC_APP_URL",
  debtReminderTemplate: "DEBT_REMINDER_TEMPLATE",
  salaryCutoff: SALARY_CUTOFF_SETTING_KEY
};

const defaults: AppSettings = {
  sepayApiKey: process.env.SEPAY_API_KEY || "",
  sepayWebhookSecret: process.env.SEPAY_WEBHOOK_SECRET || "",
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || "19000000000000",
  bankAccountName: process.env.BANK_ACCOUNT_NAME || "APLUS ACADEMY",
  bankBin: process.env.BANK_BIN || "970407",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001",
  debtReminderTemplate: process.env.DEBT_REMINDER_TEMPLATE || DEFAULT_DEBT_REMINDER_TEMPLATE,
  salaryCutoff: DEFAULT_SALARY_CUTOFF_CODE
};

export async function getAppSettings(): Promise<AppSettings> {
  const rows = await prisma.appSetting.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row.value]));

  return {
    sepayApiKey: byKey.get(settingKeys.sepayApiKey) ?? defaults.sepayApiKey,
    sepayWebhookSecret: byKey.get(settingKeys.sepayWebhookSecret) ?? defaults.sepayWebhookSecret,
    bankAccountNumber: byKey.get(settingKeys.bankAccountNumber) ?? defaults.bankAccountNumber,
    bankAccountName: byKey.get(settingKeys.bankAccountName) ?? defaults.bankAccountName,
    bankBin: byKey.get(settingKeys.bankBin) ?? defaults.bankBin,
    appUrl: byKey.get(settingKeys.appUrl) ?? defaults.appUrl,
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

export async function saveAppSettings(settings: AppSettings) {
  await prisma.$transaction(
    Object.entries(settingKeys).map(([field, key]) =>
      prisma.appSetting.upsert({
        where: { key },
        update: { value: settings[field as keyof AppSettings] },
        create: { key, value: settings[field as keyof AppSettings] }
      })
    )
  );
}
