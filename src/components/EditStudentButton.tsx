"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { updateStudentAction } from "@/lib/actions/students";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, FormSection, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";

type Student = {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  parentName: string | null;
  birthYear: number | null;
  note: string | null;
};

export function EditStudentButton({ student, size = "icon" }: { student: Student; size?: "icon" | "sm" | "md" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant={size === "sm" ? "ghost" : "secondary"}
        className={
          size === "sm"
            ? "h-8 gap-1 rounded-lg px-2 text-xs text-primary hover:bg-indigo-50"
            : size === "md"
              ? "h-10 gap-2 px-4 text-primary hover:bg-indigo-50"
              : "h-9 w-9 px-0 text-primary hover:bg-indigo-50"
        }
        title="Sửa học sinh"
        onClick={() => setOpen(true)}
      >
        <Pencil className={size === "icon" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {size === "sm" ? "Sửa" : size === "md" ? "Sửa học sinh" : null}
      </Button>
      {open ? <EditStudentDialog student={student} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EditStudentDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateStudentAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Modal title="Sửa thông tin học sinh" onClose={onClose}>
      <form action={action} className="grid gap-5">
        <input type="hidden" name="id" value={student.id} />
        <FormSection title="Học sinh" className="sm:grid-cols-[minmax(0,1fr)_120px]">
          <Field label="Họ tên" required>
            <Input name="fullName" defaultValue={student.fullName} required autoComplete="off" />
          </Field>
          <Field label="Năm sinh">
            <Input
              name="birthYear"
              type="number"
              inputMode="numeric"
              min={1950}
              max={new Date().getFullYear()}
              defaultValue={student.birthYear ?? ""}
            />
          </Field>
          <p className="-mt-1 text-xs text-stone-500 sm:col-span-2">Xóa trống năm sinh thì hệ thống tính lại theo lớp đang học.</p>
        </FormSection>
        <FormSection title="Phụ huynh">
          <Field label="Số điện thoại" required>
            <Input name="phone" defaultValue={student.phone} required inputMode="tel" autoComplete="off" />
          </Field>
          <Field label="Tên phụ huynh" optional>
            <Input name="parentName" defaultValue={student.parentName ?? ""} autoComplete="off" />
          </Field>
          <Field label="Địa chỉ" optional className="sm:col-span-2">
            <Input name="address" defaultValue={student.address} autoComplete="off" />
          </Field>
        </FormSection>
        <Field label="Ghi chú" optional>
          <Textarea name="note" rows={3} defaultValue={student.note ?? ""} />
        </Field>
        {state.error ? <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">{state.error}</p> : null}
        <div className="modal-actions flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
