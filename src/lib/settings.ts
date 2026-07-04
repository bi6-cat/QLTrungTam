import { prisma } from "@/lib/prisma";

export type AppSettings = {
  sepayApiKey: string;
  sepayWebhookSecret: string;
  bankAccountNumber: string;
  bankAccountName: string;
  bankBin: string;
  appUrl: string;
};

const settingKeys: Record<keyof AppSettings, string> = {
  sepayApiKey: "SEPAY_API_KEY",
  sepayWebhookSecret: "SEPAY_WEBHOOK_SECRET",
  bankAccountNumber: "BANK_ACCOUNT_NUMBER",
  bankAccountName: "BANK_ACCOUNT_NAME",
  bankBin: "BANK_BIN",
  appUrl: "NEXT_PUBLIC_APP_URL"
};

const defaults: AppSettings = {
  sepayApiKey: process.env.SEPAY_API_KEY || "",
  sepayWebhookSecret: process.env.SEPAY_WEBHOOK_SECRET || "",
  bankAccountNumber: process.env.BANK_ACCOUNT_NUMBER || "19000000000000",
  bankAccountName: process.env.BANK_ACCOUNT_NAME || "APLUS ACADEMY",
  bankBin: process.env.BANK_BIN || "970407",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001"
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
    appUrl: byKey.get(settingKeys.appUrl) ?? defaults.appUrl
  };
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
