"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, RotateCcw } from "lucide-react";
import {
  archiveClassAction,
  archiveStudentAction,
  restoreClassAction,
  restoreStudentAction
} from "@/lib/actions";
import { Modal } from "@/components/Modal";
import { Button, Field, Textarea } from "@/components/ui";

type EntityKind = "class" | "student";

export function ArchiveEntityButton({
  kind,
  entityId,
  entityName,
  archived,
  compact = false
}: {
  kind: EntityKind;
  entityId: string;
  entityName: string;
  archived: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const label = archived ? "Khôi phục" : "Lưu trữ";
  const entityLabel = kind === "class" ? "lớp" : "học sinh";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const action =
      kind === "class"
        ? archived
          ? restoreClassAction
          : archiveClassAction
        : archived
          ? restoreStudentAction
          : archiveStudentAction;

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
        router.refresh();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : `Không thể ${label.toLowerCase()} ${entityLabel}.`);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={archived ? "secondary" : "ghost"}
        className={
          compact
            ? "h-9 w-9 shrink-0 px-0 text-stone-500 hover:bg-stone-100"
            : "h-9 px-3 text-stone-600"
        }
        title={`${label} ${entityLabel}`}
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        {compact ? null : label}
      </Button>

      {open ? (
        <Modal title={`${label} ${entityLabel}?`} onClose={() => !pending && setOpen(false)}>
          <form onSubmit={submit} className="grid gap-4">
            <p className="text-sm text-stone-600">
              {archived ? (
                <>Khôi phục <strong>{entityName}</strong> vào danh sách đang hoạt động.</>
              ) : (
                <>
                  <strong>{entityName}</strong> sẽ được ẩn khỏi danh sách hoạt động. Hóa đơn, giao dịch và lịch sử vẫn được giữ nguyên.
                </>
              )}
            </p>
            <input type="hidden" name="id" value={entityId} />
            <Field label="Lý do">
              <Textarea
                name="reason"
                required
                maxLength={500}
                disabled={pending}
                autoFocus
                placeholder={archived ? "Ví dụ: Học sinh quay lại học..." : "Ví dụ: Đã kết thúc khóa học..."}
              />
            </Field>
            {error ? <p className="text-sm font-medium text-warning" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" variant={archived ? "primary" : "secondary"} disabled={pending}>
                {archived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                {pending ? "Đang lưu..." : label}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
