"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { updateStudentAction } from "@/lib/actions";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { Modal } from "@/components/Modal";

type Student = {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  parentName: string | null;
  note: string | null;
};

export function EditStudentButton({ student }: { student: Student }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-9 w-9 px-0 text-primary hover:bg-indigo-50"
        title="Sửa học sinh"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-5 w-5" />
      </Button>
      {open ? <EditStudentDialog student={student} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EditStudentDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateStudentAction, { error: "", ok: false });

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <Modal title="Sửa thông tin học sinh" onClose={onClose}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={student.id} />
        <Field label="Họ tên">
          <Input name="fullName" defaultValue={student.fullName} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Số điện thoại">
            <Input name="phone" defaultValue={student.phone} required />
          </Field>
          <Field label="Phụ huynh">
            <Input name="parentName" defaultValue={student.parentName ?? ""} />
          </Field>
        </div>
        <Field label="Địa chỉ">
          <Input name="address" defaultValue={student.address} />
        </Field>
        <Field label="Ghi chú">
          <Textarea name="note" defaultValue={student.note ?? ""} />
        </Field>
        {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
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
