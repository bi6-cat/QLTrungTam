"use client";

import { useEffect, useRef } from "react";
import { Hash, KeyRound, LogIn, UserRound } from "lucide-react";
import { staffLoginAction, studentLoginAction } from "@/app/login/actions";
import { Button, Field, Input } from "@/components/ui";
import { useKeepValuesAction } from "@/components/useKeepValuesAction";

/** Sai thì giữ tên đăng nhập / mã học sinh, chỉ xoá ô mật khẩu / PIN và đưa con trỏ về đó. */
// Theo dõi cả object state (mỗi lần nộp là object mới) để sai hai lần cùng thông báo vẫn xoá lại.
function useClearSecretOnError(state: { error: string }) {
  const secretRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!state.error || !secretRef.current) return;
    secretRef.current.value = "";
    secretRef.current.focus();
  }, [state]);
  return secretRef;
}

function ErrorMessage({ error }: { error: string }) {
  if (!error) return null;
  return <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>;
}

/** Quản lý và giáo viên dùng chung form; server tự nhận ra loại tài khoản. */
export function StaffLoginForm() {
  const [state, onSubmit, pending] = useKeepValuesAction(staffLoginAction, { error: "" });
  const passwordRef = useClearSecretOnError(state);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Tên đăng nhập">
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input name="username" autoComplete="username" autoCapitalize="none" required className="h-12 pl-10" />
        </span>
      </Field>
      <Field label="Mật khẩu">
        <span className="relative block">
          <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input ref={passwordRef} name="password" type="password" autoComplete="current-password" required className="h-12 pl-10" />
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
  const [state, onSubmit, pending] = useKeepValuesAction(studentLoginAction, { error: "" });
  const pinRef = useClearSecretOnError(state);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Field label="Mã học sinh">
        <span className="relative block">
          <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            name="code"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="VD: HuongNV02"
            required
            className="h-12 pl-10 font-mono tracking-wide"
          />
        </span>
      </Field>
      <Field label="Mã PIN (6 số)">
        <span className="relative block">
          <Hash className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            ref={pinRef}
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
