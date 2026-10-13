"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import type { ResultState } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button } from "@/components/ui";

/** Nút xóa có hỏi lại trước khi gọi server action `action(id)`, báo kết quả bằng toast. */
export function ConfirmDeleteButton({
  id,
  action,
  title,
  description,
  iconOnly = false
}: {
  id: string;
  action: (id: string) => Promise<ResultState>;
  title: string;
  description: React.ReactNode;
  /** Chỉ hiện icon thùng rác (bảng nhiều cột, cần gọn). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  function confirm() {
    startTransition(async () => {
      try {
        const result = await action(id);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          markStale();
        }
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
        className={
          iconOnly
            ? "h-7 w-7 shrink-0 rounded-lg px-0 text-stone-400 hover:bg-rose-50 hover:text-warning"
            : "h-8 gap-1 rounded-lg px-2 text-xs text-stone-500 hover:bg-rose-50 hover:text-warning"
        }
        title={title}
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="h-3.5 w-3.5" />
        {iconOnly ? null : "Xóa"}
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
