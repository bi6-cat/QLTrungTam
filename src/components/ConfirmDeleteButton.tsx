"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ResultState } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui";

/** Nút xóa có hỏi lại trước khi gọi server action `action(id)`, báo kết quả bằng toast. */
export function ConfirmDeleteButton({
  id,
  action,
  title,
  description
}: {
  id: string;
  action: (id: string) => Promise<ResultState>;
  title: string;
  description: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await action(id);
        if (result.error) toast.error(result.error);
        else toast.success(result.success);
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      } finally {
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 px-0 text-stone-400 hover:bg-rose-50 hover:text-warning"
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {open ? (
        <Modal title={title} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4">
            <div className="text-sm text-stone-600">{description}</div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                <Trash2 className="h-4 w-4" />
                {pending ? "Đang xóa..." : "Xóa"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
