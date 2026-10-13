"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { clsx } from "clsx";
import { createSurveyAction } from "@/lib/actions/surveys";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { Button, Field, Input, Select } from "@/components/ui";
import { AUDIENCE_LABEL, SURVEY_AUDIENCES, SURVEY_TEMPLATES } from "@/lib/survey-core";

export function CreateSurveyButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Tạo khảo sát
      </Button>
      {open ? <CreateSurveyDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CreateSurveyDialog({ onClose }: { onClose: () => void }) {
  // Thành công thì action chuyển sang trang khảo sát mới, không cần đóng hộp thoại.
  const [state, action, pending] = useActionState(createSurveyAction, EMPTY_RESULT_STATE);
  const [templateKey, setTemplateKey] = useState(SURVEY_TEMPLATES[0].key);
  const template = SURVEY_TEMPLATES.find((t) => t.key === templateKey) ?? SURVEY_TEMPLATES[0];
  const [title, setTitle] = useState(template.title);
  const [titleTouched, setTitleTouched] = useState(false);
  const [audience, setAudience] = useState<string>(template.audience);

  function pickTemplate(key: string) {
    const next = SURVEY_TEMPLATES.find((t) => t.key === key);
    if (!next) return;
    setTemplateKey(key);
    setAudience(next.audience);
    if (!titleTouched) setTitle(next.key === "blank" ? "" : next.title);
  }

  return (
    <Modal title="Tạo khảo sát" onClose={() => !pending && onClose()} closeDisabled={pending} maxWidthClassName="max-w-2xl">
      <form action={action} className="grid gap-4">
        <input type="hidden" name="templateKey" value={templateKey} />
        <fieldset>
          <legend className="text-sm font-medium text-stone-700">Bắt đầu từ mẫu</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {SURVEY_TEMPLATES.map((t) => {
              const active = t.key === templateKey;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pickTemplate(t.key)}
                  aria-pressed={active}
                  className={clsx(
                    "focus-ring relative rounded-xl border p-3 text-left transition-colors",
                    active ? "border-primary bg-indigo-50/60 ring-1 ring-primary" : "border-stone-200 hover:border-stone-300 hover:bg-stone-50"
                  )}
                >
                  {active ? <Check className="absolute right-3 top-3 h-4 w-4 text-primary" /> : null}
                  <p className="pr-6 text-sm font-semibold text-neutralText">{t.title}</p>
                  <p className="mt-1 text-xs text-stone-500">{t.description}</p>
                  <p className="mt-2 text-xs font-medium text-stone-400">
                    {t.questions.length > 0 ? `${t.questions.length} câu hỏi` : "Không có câu hỏi sẵn"}
                  </p>
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <Field label="Tên khảo sát">
            <Input
              name="title"
              required
              maxLength={150}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleTouched(true);
              }}
              placeholder="Đánh giá giáo viên học kỳ 1"
            />
          </Field>
          <Field label="Người trả lời">
            <Select name="audience" value={audience} onChange={(event) => setAudience(event.target.value)}>
              {SURVEY_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-stone-500">
          Khảo sát được tạo ở trạng thái nháp, gửi cho mọi lớp đang hoạt động. Bạn sửa câu hỏi, chọn lớp rồi mới mở để nhận phiếu.
        </p>
        {state.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            <Plus className="h-4 w-4" />
            {pending ? "Đang tạo..." : "Tạo khảo sát"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
