"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, UserPlus } from "lucide-react";
import { createStudentAction } from "@/lib/actions/students";
import { useResultToast } from "@/components/Toaster";
import { EMPTY_CREATE_STUDENT_STATE } from "@/lib/action-states";
import { Button, Field, FormSection, Input, Textarea } from "@/components/ui";
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
        <Modal
          title="Thêm học sinh"
          description="Cùng họ tên và số điện thoại với hồ sơ đã có thì không tạo được (chặn trùng)."
          onClose={() => setOpen(false)}
        >
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
    <form ref={formRef} action={action} className="grid gap-5">
      <FormSection title="Học sinh" className="sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="Họ tên" required>
          <Input name="fullName" required autoFocus autoComplete="off" placeholder="Nguyễn Văn An" />
        </Field>
        <Field label="Năm sinh">
          <Input name="birthYear" type="number" inputMode="numeric" min={1950} max={new Date().getFullYear()} placeholder="2011" />
        </Field>
        <p className="-mt-1 text-xs text-stone-500 sm:col-span-2">Bỏ trống năm sinh thì hệ thống tự tính theo lớp khi xếp lớp.</p>
      </FormSection>

      <FormSection title="Phụ huynh">
        <Field label="Số điện thoại" required hint="Dùng làm nội dung chuyển khoản học phí.">
          <Input name="phone" required inputMode="tel" autoComplete="off" placeholder="0912 345 678" />
        </Field>
        <Field label="Tên phụ huynh" optional>
          <Input name="parentName" autoComplete="off" placeholder="Mẹ An" />
        </Field>
        <Field label="Địa chỉ" optional className="sm:col-span-2">
          <Input name="address" autoComplete="off" />
        </Field>
      </FormSection>

      <Field label="Ghi chú" optional>
        <Textarea name="note" rows={3} placeholder="Học lực, lưu ý khi liên hệ…" />
      </Field>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      {state.warning ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.warning}</span>
        </div>
      ) : null}

      <div className="modal-actions flex justify-end gap-2">
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
