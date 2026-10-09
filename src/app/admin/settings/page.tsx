import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { ManagerAccounts } from "@/components/ManagerAccounts";
import { SettingsForm } from "@/components/SettingsForm";
import { Panel, PageHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getAppSettings, maskSecret } from "@/lib/settings";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireStaff();

  // Quản lý phụ chỉ đổi được mật khẩu của chính mình.
  if (user.role !== "owner") {
    return (
      <div className="grid gap-6">
        <PageHeader title="Tài khoản" description={`Đang đăng nhập: ${user.username} (quản lý phụ).`} />
        <Panel>
          <h2 className="mb-4 text-lg font-bold text-neutralText">Đổi mật khẩu</h2>
          <ChangePasswordForm />
        </Panel>
      </div>
    );
  }

  const [settings, managers] = await Promise.all([
    getAppSettings(),
    prisma.adminUser.findMany({
      where: { role: "manager" },
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, createdAt: true }
    })
  ]);

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
          <h2 className="text-lg font-bold text-neutralText">Tài khoản quản lý phụ</h2>
          <p className="mt-1 text-sm text-stone-600">
            Quản lý phụ xem Tổng quan, nhập số buổi ở mục Lớp học, xem và copy tin nhắc nợ ở Công nợ, xem Giao
            dịch và xuất Báo cáo. Không thêm/sửa/xóa lớp, học sinh, hóa đơn hay giao dịch.
          </p>
        </div>
        <ManagerAccounts
          managers={managers.map((manager) => ({
            id: manager.id,
            username: manager.username,
            createdAt: manager.createdAt.toLocaleDateString("vi-VN")
          }))}
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
