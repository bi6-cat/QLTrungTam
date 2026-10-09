"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { createManagerAction, deleteManagerAction, resetManagerPasswordAction } from "@/lib/actions/accounts";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Modal } from "@/components/Modal";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input } from "@/components/ui";

type Manager = { id: string; username: string; createdAt: string };

export function ManagerAccounts({ managers }: { managers: Manager[] }) {
  const [state, action, pending] = useActionState(createManagerAction, EMPTY_RESULT_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(state);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="grid gap-5">
      {managers.length === 0 ? (
        <p className="text-sm text-stone-500">Chưa có tài khoản quản lý phụ nào.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
          {managers.map((manager) => (
            <li key={manager.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{manager.username}</p>
                <p className="text-xs text-stone-500">Tạo ngày {manager.createdAt}</p>
              </div>
              <div className="flex items-center gap-1">
                <ResetPasswordButton manager={manager} />
                <ConfirmDeleteButton
                  id={manager.id}
                  action={deleteManagerAction}
                  title={`Xóa tài khoản ${manager.username}`}
                  description={
                    <>
                      Tài khoản <strong>{manager.username}</strong> sẽ không đăng nhập được nữa và bị đăng xuất
                      ngay. Dữ liệu đã nhập vẫn giữ nguyên.
                    </>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <form ref={formRef} action={action} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Tên đăng nhập">
            <Input
              name="username"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="vd: quanly.lan"
              required
              minLength={3}
              maxLength={40}
            />
          </Field>
          <Field label="Mật khẩu (≥ 8 ký tự)">
            <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </div>
        {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
        <div>
          <Button type="submit" disabled={pending}>
            <UserPlus className="h-4 w-4" />
            {pending ? "Đang tạo..." : "Tạo tài khoản quản lý phụ"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordButton({ manager }: { manager: Manager }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetManagerPasswordAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state]);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 px-0 text-stone-500 hover:bg-indigo-50 hover:text-primary"
        title={`Đặt lại mật khẩu ${manager.username}`}
        aria-label={`Đặt lại mật khẩu ${manager.username}`}
        onClick={() => setOpen(true)}
      >
        <KeyRound className="h-4 w-4" />
      </Button>
      {open ? (
        <Modal
          title={`Đặt lại mật khẩu ${manager.username}`}
          onClose={() => !pending && setOpen(false)}
          closeDisabled={pending}
        >
          <form action={action} className="grid gap-4">
            <input type="hidden" name="userId" value={manager.id} />
            <Field label="Mật khẩu mới (≥ 8 ký tự)">
              <Input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
            </Field>
            {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" disabled={pending}>
                <KeyRound className="h-4 w-4" />
                {pending ? "Đang lưu..." : "Đặt lại"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
