import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { SettingsForm } from "@/components/SettingsForm";
import { Panel, PageHeader } from "@/components/ui";
import { getAppSettings, maskSecret } from "@/lib/settings";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await getAppSettings();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Cài đặt"
        description="Cấu hình thanh toán, key webhook và mẫu tin nhắn gửi phụ huynh."
      />

      <Panel>
        {/* Không truyền secret thật xuống trình duyệt, chỉ gửi gợi ý đã che. */}
        <SettingsForm
          values={{
            bankAccountNumber: settings.bankAccountNumber,
            bankAccountName: settings.bankAccountName,
            bankBin: settings.bankBin,
            appUrl: settings.appUrl,
            debtReminderTemplate: settings.debtReminderTemplate,
            salaryCutoff: settings.salaryCutoff,
            sepayApiKeyHint: maskSecret(settings.sepayApiKey),
            sepayWebhookSecretHint: maskSecret(settings.sepayWebhookSecret)
          }}
        />
      </Panel>

      <Panel>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-neutralText">Đổi mật khẩu admin</h2>
          <p className="mt-1 text-sm text-stone-600">
            Nên đổi mật khẩu mặc định ngay sau khi cài đặt lần đầu.
          </p>
        </div>
        <ChangePasswordForm />
      </Panel>
    </div>
  );
}
