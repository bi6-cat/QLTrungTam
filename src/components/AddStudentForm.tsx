"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, UserPlus } from "lucide-react";
import { createStudentAction } from "@/lib/actions/students";
import { useResultToast } from "@/components/Toaster";
import { EMPTY_CREATE_STUDENT_STATE } from "@/lib/action-states";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";

/** Nút mở hộp thoại thêm học sinh; thêm xong form tự dọn để nhập tiếp người kế. */
export function AddStudentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <UserPlus className="h-4 w-4" />
        Thêm học sinh
      </Button>
      {open ? (
        <Modal title="Thêm học sinh" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-stone-600">
            Hệ thống chặn tạo trùng khi cùng họ tên và số điện thoại với hồ sơ đã có.
          </p>
          <AddStudentForm onCancel={() => setOpen(false)} />
        </Modal>
      ) : null}
    </>
  );
}

export function AddStudentForm({ onCancel }: { onCancel?: () => void }) {
  const [state, action, pending] = useActionState(createStudentAction, EMPTY_CREATE_STUDENT_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  // Thành công thì useResultToast nạp lại danh sách.
  useResultToast(state);

  // Thêm xong thì dọn form để nhập tiếp học sinh kế, nhưng vẫn giữ thông báo.
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 sm:grid-cols-2">
      <Field label="Họ tên">
        <Input name="fullName" required autoFocus />
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
      <div className="sm:col-span-2">
        <Field label="Ghi chú" hint="Không bắt buộc">
          <Textarea name="note" />
        </Field>
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 sm:col-span-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      {state.warning ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800 sm:col-span-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.warning}</span>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Đóng
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Đang thêm..." : "Thêm học sinh"}
        </Button>
      </div>
    </form>
  );
}
