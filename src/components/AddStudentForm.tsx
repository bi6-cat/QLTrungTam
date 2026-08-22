"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { createStudentAction } from "@/lib/actions";
import { EMPTY_CREATE_STUDENT_STATE } from "@/lib/action-states";
import { Button, Field, Input, Textarea } from "@/components/ui";

export function AddStudentForm() {
  const [state, action, pending] = useActionState(createStudentAction, EMPTY_CREATE_STUDENT_STATE);
  const formRef = useRef<HTMLFormElement>(null);

  // Thêm xong thì dọn form để nhập tiếp học sinh kế, nhưng vẫn giữ thông báo.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form ref={formRef} action={action} className="mt-4 grid gap-3 lg:grid-cols-4">
      <Field label="Họ tên">
        <Input name="fullName" required />
      </Field>
      <Field label="Số điện thoại">
        <Input name="phone" required inputMode="numeric" />
      </Field>
      <Field label="Phụ huynh">
        <Input name="parentName" />
      </Field>
      <Field label="Địa chỉ">
        <Input name="address" />
      </Field>
      <div className="lg:col-span-4">
        <Field label="Ghi chú">
          <Textarea name="note" />
        </Field>
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 lg:col-span-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      {state.success ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-700 lg:col-span-4">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.success}</span>
        </div>
      ) : null}
      {state.warning ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 lg:col-span-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.warning}</span>
        </div>
      ) : null}

      <div className="lg:col-span-4">
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Đang thêm..." : "Thêm học sinh"}
        </Button>
      </div>
    </form>
  );
}
