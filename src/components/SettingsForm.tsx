"use client";

import { useActionState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { updateSettingsAction } from "@/lib/actions/settings";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { SalaryCutoffSelect } from "@/components/SalaryCutoffSelect";
import { Button, Field, Input, Textarea } from "@/components/ui";

export type SettingsFormValues = {
  bankAccountNumber: string;
  bankAccountName: string;
  bankBin: string;
  appUrl: string;
  debtReminderTemplate: string;
  salaryCutoff: string;
  /** Chỉ là gợi ý đã che (vd "••••a1b2"), không bao giờ là secret thật. */
  sepayApiKeyHint: string;
  sepayWebhookSecretHint: string;
};

export function SettingsForm({ values }: { values: SettingsFormValues }) {
  const [state, action, pending] = useActionState(updateSettingsAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  return (
    <form action={action} className="grid gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Số tài khoản nhận tiền">
          <Input name="bankAccountNumber" defaultValue={values.bankAccountNumber} required />
        </Field>
        <Field label="Tên tài khoản">
          <Input name="bankAccountName" defaultValue={values.bankAccountName} required />
        </Field>
        <Field label="Mã ngân hàng VietQR / BIN">
          <Input name="bankBin" defaultValue={values.bankBin} required />
        </Field>
        <Field label="Địa chỉ app">
          <Input name="appUrl" defaultValue={values.appUrl} placeholder="http://localhost:3001" />
        </Field>
      </div>

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
