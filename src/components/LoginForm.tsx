"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import { loginAction } from "@/lib/actions";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field label="Tên đăng nhập">
        <Input name="username" autoComplete="username" required defaultValue="admin" />
      </Field>
      <Field label="Mật khẩu">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>
        <LogIn className="h-4 w-4" />
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}
