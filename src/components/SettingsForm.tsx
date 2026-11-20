"use client";

import { useActionState } from "react";
import { AlertTriangle, Lock, Save } from "lucide-react";
import { updateSettingsAction } from "@/lib/actions/settings";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { SalaryCutoffSelect } from "@/components/SalaryCutoffSelect";
import { Button, Field, Input, Textarea } from "@/components/ui";
import type { BankEnv } from "@/lib/settings";

export type SettingsFormValues = {
  debtReminderTemplate: string;
  salaryCutoff: string;
  /** Chỉ là gợi ý đã che (vd "••••a1b2"), không bao giờ là secret thật. */
  sepayApiKeyHint: string;
  sepayWebhookSecretHint: string;
};

const BANK_ROWS: Array<{ label: string; env: string; key: "bankAccountNumber" | "bankAccountName" | "bankBin" | "appUrl" }> = [
  { label: "Số tài khoản nhận tiền", env: "BANK_ACCOUNT_NUMBER", key: "bankAccountNumber" },
  { label: "Tên tài khoản", env: "BANK_ACCOUNT_NAME", key: "bankAccountName" },
  { label: "Mã ngân hàng (BIN)", env: "BANK_BIN", key: "bankBin" },
  { label: "Địa chỉ app (link gửi phụ huynh)", env: "NEXT_PUBLIC_APP_URL", key: "appUrl" }
];

/** STK chỉ để xem: đổi bằng .env trên máy chủ rồi khởi động lại app. */
function BankInfo({ bank }: { bank: BankEnv }) {
  return (
    <div className="grid gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
      <div className="flex items-start gap-2 text-sm text-stone-700">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
        <p>
          <strong>Tài khoản nhận học phí bị khóa trên web</strong> để không ai chiếm được tài khoản admin mà đổi được STK
          trên mã QR. Muốn đổi thì sửa file <code className="font-mono">.env</code> trên máy chủ và khởi động lại app.
        </p>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {BANK_ROWS.map((row) => {
          const missing = bank.problems.includes(row.env);
          return (
            <div key={row.env} className="rounded-lg border border-stone-200 bg-white px-3 py-2">
              <dt className="text-xs text-stone-500">
                {row.label} · <code className="font-mono">{row.env}</code>
              </dt>
              <dd className={`mt-0.5 break-all font-mono text-sm font-semibold ${missing ? "text-rose-600" : "text-neutralText"}`}>
                {missing ? "Chưa cấu hình hoặc sai định dạng" : bank[row.key]}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function SettingsForm({ values, bank }: { values: SettingsFormValues; bank: BankEnv }) {
  const [state, action, pending] = useActionState(updateSettingsAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  return (
    <form action={action} className="grid gap-5">
      <BankInfo bank={bank} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Ngày chốt lương giáo viên" hint="Lớp nào khác thì đặt riêng ở Sửa lớp">
          <SalaryCutoffSelect name="salaryCutoff" defaultValue={values.salaryCutoff} />
        </Field>
        <p className="self-end rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900">
          Học phí nộp đến hết ngày chốt tính vào lương tháng đó; nộp sau ngày chốt tự chuyển sang lương tháng
          sau và có ghi chú tên học sinh ở trang Lương GV. Đổi ngày chốt sẽ tính lại cả các tháng cũ.
        </p>
      </div>

      <Field
        label="Mẫu tin nhắn nhắc nợ"
        hint="Biến dùng được: {{studentName}}, {{parentName}}, {{debtDetails}}, {{totalAmount}}, {{paymentSection}}, {{payUrl}}, {{centerName}}, {{centerPhone}}"
      >
        <Textarea
          name="debtReminderTemplate"
          defaultValue={values.debtReminderTemplate}
          rows={14}
          maxLength={5000}
          required
          className="font-mono text-sm"
        />
      </Field>

      <div className="grid gap-4 lg:grid-cols-2">
        <Field
          label="SePay API Key"
          hint={values.sepayApiKeyHint ? `Đang dùng ${values.sepayApiKeyHint}` : "Chưa cấu hình"}
        >
          <Input
            name="sepayApiKey"
            type="password"
            autoComplete="off"
            placeholder="Để trống = giữ nguyên"
          />
        </Field>
        <Field
          label="SePay Webhook Secret"
          hint={values.sepayWebhookSecretHint ? `Đang dùng ${values.sepayWebhookSecretHint}` : "Chưa cấu hình"}
        >
          <Input
            name="sepayWebhookSecret"
            type="password"
            autoComplete="off"
            placeholder="Để trống = giữ nguyên"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
        Logo hiển thị ở thanh điều hướng đọc từ <code className="font-mono">public/logo.jpg</code>.
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Đang lưu..." : "Lưu cài đặt"}
        </Button>
      </div>
    </form>
  );
}
