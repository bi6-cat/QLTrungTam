"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { changePasswordAction } from "@/lib/actions/auth";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input } from "@/components/ui";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Mật khẩu hiện tại">
          <Input name="currentPassword" type="password" autoComplete="current-password" required />
        </Field>
        <Field label="Mật khẩu mới (≥ 8 ký tự)">
          <Input name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
        <Field label="Xác nhận mật khẩu mới">
          <Input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
      </div>
      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          <KeyRound className="h-4 w-4" />
          {pending ? "Đang đổi..." : "Đổi mật khẩu"}
        </Button>
      </div>
    </form>
  );
}
