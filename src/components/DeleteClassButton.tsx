"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { deleteClassAction } from "@/lib/actions";
import { Button } from "@/components/ui";

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
        className="h-9 w-9 shrink-0 rounded-md px-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
        title="Xóa lớp"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-5 w-5" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4">
          <div className="w-full max-w-sm rounded-lg border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-neutralText">Xóa lớp?</h3>
                <p className="mt-2 text-sm text-stone-600">
                  Bạn sắp xóa lớp <strong>{className}</strong>. Các học sinh trong lớp và hóa đơn liên quan cũng sẽ bị xóa khỏi lớp này.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 shrink-0 px-0"
                onClick={() => setOpen(false)}
                title="Đóng"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

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
          </div>
        </div>
      ) : null}
    </>
  );
}
