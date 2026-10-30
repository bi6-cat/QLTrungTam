"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteMaterialAction } from "@/app/teacher/(portal)/materials/actions";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { Button } from "@/components/ui";

export function DeleteMaterialButton({ materialId, title }: { materialId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await deleteMaterialAction(materialId);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          router.push("/teacher/materials");
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Gỡ tài liệu
      </Button>
      {open ? (
        <Modal title={`Gỡ tài liệu "${title}"`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4">
            <p className="text-sm text-stone-600">
              Tài liệu bị xoá khỏi lớp, học sinh không còn thấy. File gốc trên Google Drive hay trang khác vẫn còn nguyên.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                <Trash2 className="h-4 w-4" />
                {pending ? "Đang gỡ..." : "Gỡ tài liệu"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
