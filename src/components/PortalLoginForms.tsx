"use client";

import { useActionState } from "react";
import { Hash, KeyRound, LogIn, UserRound } from "lucide-react";
import { studentLoginAction, teacherLoginAction } from "@/app/login/actions";
import { Button, Field, Input } from "@/components/ui";

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>;
}

export function TeacherLoginForm() {
  const [state, action, pending] = useActionState(teacherLoginAction, { error: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field label="Tên đăng nhập">
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="username" autoComplete="username" autoCapitalize="none" required className="h-12 pl-10" />
        </span>
      </Field>
      <Field label="Mật khẩu">
        <span className="relative block">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="password" type="password" autoComplete="current-password" required className="h-12 pl-10" />
        </span>
      </Field>
      <ErrorMessage error={state.error} />
      <Button type="submit" disabled={pending} className="mt-1 h-12">
        <LogIn className="h-4 w-4" />
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}

export function StudentLoginForm() {
  const [state, action, pending] = useActionState(studentLoginAction, { error: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field label="Mã học sinh">
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            name="code"
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="VD: K7M2XQ"
            required
            className="h-12 pl-10 font-mono uppercase tracking-widest"
          />
        </span>
      </Field>
      <Field label="Mã PIN (6 số)">
        <span className="relative block">
          <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            pattern="\d{6}"
            maxLength={6}
            title="Gồm 6 chữ số"
            required
            className="h-12 pl-10 font-mono tracking-widest"
          />
        </span>
      </Field>
      <ErrorMessage error={state.error} />
      <Button type="submit" disabled={pending} className="mt-1 h-12">
        <LogIn className="h-4 w-4" />
        {pending ? "Đang đăng nhập..." : "Vào học"}
      </Button>
    </form>
  );
}
