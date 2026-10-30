"use client";

import { Save } from "lucide-react";
import { saveMaterialAction } from "@/app/teacher/(portal)/materials/actions";
import { useKeepValuesAction } from "@/components/useKeepValuesAction";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";

type Option = { id: string; label: string };

export function MaterialForm({
  classes,
  maxTitle,
  maxNote,
  materialId,
  defaults
}: {
  classes: Option[];
  maxTitle: number;
  maxNote: number;
  materialId?: string;
  defaults?: { classId?: string; title?: string; url?: string; note?: string };
}) {
  const [state, onSubmit, pending] = useKeepValuesAction(saveMaterialAction, EMPTY_RESULT_STATE);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {materialId ? <input type="hidden" name="materialId" value={materialId} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lớp">
          <Select name="classId" required defaultValue={defaults?.classId ?? classes[0]?.id}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Tên tài liệu">
          <Input name="title" defaultValue={defaults?.title} placeholder="vd: Đề cương ôn tập Unit 3" required maxLength={maxTitle} />
        </Field>
      </div>
      <Field label="Đường dẫn" hint="Google Drive, YouTube, Quizlet…">
        <Input name="url" type="text" inputMode="url" defaultValue={defaults?.url} placeholder="https://drive.google.com/…" spellCheck={false} />
      </Field>
      <Field label="Ghi chú" hint="không bắt buộc nếu đã có đường dẫn">
        <Textarea name="note" defaultValue={defaults?.note} rows={5} maxLength={maxNote} placeholder="vd: Làm trang 12–14 trước buổi thứ Bảy." />
      </Field>
      <p className="text-xs text-stone-500">
        File trên Google Drive cần để chế độ &quot;Bất kỳ ai có đường liên kết&quot; thì học sinh mới mở được.
      </p>

      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Đang lưu..." : materialId ? "Lưu thay đổi" : "Đăng tài liệu"}
        </Button>
      </div>
    </form>
  );
}
