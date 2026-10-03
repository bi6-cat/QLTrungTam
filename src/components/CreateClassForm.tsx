"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertTriangle, Plus } from "lucide-react";
import { createClassAction } from "@/lib/actions/classes";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input } from "@/components/ui";

export function CreateClassForm() {
  const [state, action, pending] = useActionState(createClassAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  const formRef = useRef<HTMLFormElement>(null);

  // Tạo xong thì dọn form; lỗi thì giữ nguyên những gì đã gõ để sửa tiếp.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="mt-4 grid gap-3">
      <Field label="Tên lớp">
        <Input name="name" required placeholder="Lớp 10A - Toán" />
      </Field>
      <Field label="Mã lớp">
        <Input name="shortCode" required placeholder="L10A" />
      </Field>
      <Field label="Tên giáo viên">
        <Input name="teacherName" placeholder="Cô Hạnh" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Giá / buổi">
          <Input name="pricePerSession" type="number" min="0" required />
        </Field>
        <Field label="Buổi / tháng">
          <Input name="sessionsPerMonthDefault" type="number" min="1" defaultValue="8" required />
        </Field>
      </div>
      <Field label="% lương GV" hint="% học phí đã thu, nhập sau cũng được">
        <Input name="teacherSharePercent" type="number" min="0" max="100" defaultValue="0" />
      </Field>
      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        <Plus className="h-4 w-4" />
        {pending ? "Đang tạo..." : "Tạo lớp"}
      </Button>
    </form>
  );
}
