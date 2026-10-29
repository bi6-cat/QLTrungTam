"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { closeAssignmentAction } from "@/app/teacher/(portal)/assignments/actions";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button } from "@/components/ui";

export function CloseAssignmentButton({ assignmentId }: { assignmentId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending, () => setOpen(false));

  function confirm() {
    startTransition(async () => {
      try {
        const result = await closeAssignmentAction(assignmentId);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          markStale();
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Lock className="h-4 w-4" />
        Đóng bài
      </Button>
      {open ? (
        <Modal title="Đóng bài sớm" onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4">
            <p className="text-sm text-stone-600">
              Học sinh không bắt đầu lượt mới được nữa. Em nào đang làm dở vẫn nộp được. Kết quả giữ nguyên.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Huỷ
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                <Lock className="h-4 w-4" />
                {pending ? "Đang đóng..." : "Đóng bài"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
