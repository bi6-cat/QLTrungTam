"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { archiveVocabSetAction } from "@/app/teacher/(portal)/vocab/actions";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui";

export function ArchiveVocabSetButton({ setId, title }: { setId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await archiveVocabSetAction(setId);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          router.push("/teacher/vocab");
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Archive className="h-4 w-4" />
        Lưu trữ
      </Button>
      {open ? (
        <Modal title={`Lưu trữ bộ "${title}"`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4">
            <p className="text-sm text-stone-600">
              Bộ từ ẩn khỏi danh sách và không giao bài mới được nữa. Bài đã giao với bộ này và kết quả của học sinh vẫn giữ nguyên.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                <Archive className="h-4 w-4" />
                {pending ? "Đang lưu trữ..." : "Lưu trữ"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
