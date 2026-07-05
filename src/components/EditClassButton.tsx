"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { updateClassAction } from "@/lib/actions";
import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/Modal";

type ClassInfo = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  pricePerSession: number;
  sessionsPerMonthDefault: number;
};

export function EditClassButton({ classRoom }: { classRoom: ClassInfo }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Sửa lớp
      </Button>
      {open ? <EditClassDialog classRoom={classRoom} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function EditClassDialog({ classRoom, onClose }: { classRoom: ClassInfo; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateClassAction, { error: "", ok: false });

  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <Modal title="Sửa thông tin lớp" onClose={onClose}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={classRoom.id} />
        <Field label="Tên lớp">
          <Input name="name" defaultValue={classRoom.name} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mã lớp">
            <Input name="shortCode" defaultValue={classRoom.shortCode} required />
          </Field>
          <Field label="Tên giáo viên">
            <Input name="teacherName" defaultValue={classRoom.teacherName} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Giá / buổi">
            <Input
              name="pricePerSession"
              type="number"
              min="0"
              defaultValue={classRoom.pricePerSession}
              required
            />
          </Field>
          <Field label="Buổi / tháng">
            <Input
              name="sessionsPerMonthDefault"
              type="number"
              min="1"
              max="60"
              defaultValue={classRoom.sessionsPerMonthDefault}
              required
            />
          </Field>
        </div>
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
