import { Save } from "lucide-react";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { updateSettingsAction } from "@/lib/actions";
import { Field, Input, Panel, PageHeader, Button } from "@/components/ui";
import { getAppSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getAppSettings();

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Cài đặt"
        description="Cấu hình thông tin thanh toán, tài khoản nhận tiền và key webhook."
      />

      <Panel>
        <form action={updateSettingsAction} className="grid gap-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="Số tài khoản nhận tiền">
              <Input name="bankAccountNumber" defaultValue={settings.bankAccountNumber} required />
            </Field>
            <Field label="Tên tài khoản">
              <Input name="bankAccountName" defaultValue={settings.bankAccountName} required />
            </Field>
            <Field label="Mã ngân hàng VietQR / BIN">
              <Input name="bankBin" defaultValue={settings.bankBin} required />
            </Field>
            <Field label="Địa chỉ app">
              <Input name="appUrl" defaultValue={settings.appUrl} placeholder="http://localhost:3001" />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field label="SePay API Key">
              <Input name="sepayApiKey" defaultValue={settings.sepayApiKey} type="password" />
            </Field>
            <Field label="SePay Webhook Secret">
              <Input name="sepayWebhookSecret" defaultValue={settings.sepayWebhookSecret} type="password" />
            </Field>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
            Logo hiển thị ở thanh điều hướng đọc từ <code className="font-mono">public/logo.jpg</code>.
          </div>

          <div>
            <Button type="submit">
              <Save className="h-4 w-4" />
              Lưu cài đặt
            </Button>
          </div>
        </form>
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
