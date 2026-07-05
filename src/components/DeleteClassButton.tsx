"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteClassAction } from "@/lib/actions";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";

export function DeleteClassButton({
  classId,
  className
}: {
  classId: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-9 w-9 shrink-0 px-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
        title="Xóa lớp"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-5 w-5" />
      </Button>

      {open ? (
        <Modal title="Xóa lớp?" onClose={() => setOpen(false)}>
          <p className="text-sm text-stone-600">
            Bạn sắp xóa lớp <strong>{className}</strong>. Các học sinh trong lớp và hóa đơn liên
            quan cũng sẽ bị xóa khỏi lớp này.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <form action={deleteClassAction}>
              <input type="hidden" name="id" value={classId} />
              <Button type="submit" variant="danger">
                <Trash2 className="h-4 w-4" />
                Xóa lớp
              </Button>
            </form>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
