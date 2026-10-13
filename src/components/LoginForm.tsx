"use client";

import { useActionState } from "react";
import { KeyRound, LogIn, UserRound } from "lucide-react";
import { loginAction } from "@/lib/actions/auth";
import { Button, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field label="Tên đăng nhập">
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="username" autoComplete="username" required className="h-12 pl-10" />
        </span>
      </Field>
      <Field label="Mật khẩu">
        <span className="relative block">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="password" type="password" autoComplete="current-password" required className="h-12 pl-10" />
        </span>
      </Field>
      {state.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{state.error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1 h-12">
        <LogIn className="h-4 w-4" />
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}
