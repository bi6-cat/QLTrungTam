"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { updateClassAction } from "@/lib/actions/classes";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { MoneyInput } from "@/components/MoneyInput";
import { SalaryCutoffSelect } from "@/components/SalaryCutoffSelect";

type ClassInfo = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  pricePerSession: number;
  sessionsPerMonthDefault: number;
  teacherSharePercent: number;
  salaryCutoff: string | null;
};

export function EditClassButton({ classRoom, defaultCutoffLabel }: { classRoom: ClassInfo; defaultCutoffLabel: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Pencil className="h-4 w-4" />
        Sửa lớp
      </Button>
      {open ? (
        <EditClassDialog
          classRoom={classRoom}
          defaultCutoffLabel={defaultCutoffLabel}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function EditClassDialog({
  classRoom,
  defaultCutoffLabel,
  onClose
}: {
  classRoom: ClassInfo;
  defaultCutoffLabel: string;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(updateClassAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Modal title="Sửa thông tin lớp" onClose={onClose}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={classRoom.id} />
        <Field label="Tên lớp">
          <Input name="name" defaultValue={classRoom.name} required />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mã lớp" hint="Không thể sửa sau khi tạo">
            <Input
              value={classRoom.shortCode}
              readOnly
              className="bg-stone-100 font-mono text-stone-500"
            />
          </Field>
          <Field label="Tên giáo viên">
            <Input name="teacherName" defaultValue={classRoom.teacherName} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Giá / buổi">
            <MoneyInput name="pricePerSession" defaultValue={classRoom.pricePerSession} required />
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
        <Field label="% lương giáo viên" hint="Phần trăm học phí đã thu của lớp">
          <Input
            name="teacherSharePercent"
            type="number"
            min="0"
            max="100"
            step="1"
            defaultValue={classRoom.teacherSharePercent}
            required
          />
        </Field>
        <Field label="Ngày chốt lương" hint="HS nộp sau ngày này tính vào lương tháng sau">
          <SalaryCutoffSelect
            name="salaryCutoff"
            defaultValue={classRoom.salaryCutoff ?? ""}
            inheritLabel={defaultCutoffLabel}
          />
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
