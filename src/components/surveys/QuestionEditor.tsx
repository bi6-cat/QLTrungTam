"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Lock, Pencil, Plus, Save } from "lucide-react";
import { deleteSurveyQuestionAction, moveSurveyQuestionAction, saveSurveyQuestionAction } from "@/lib/actions/surveys";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { Modal } from "@/components/Modal";
import { toast, useResultToast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Badge, Button, EmptyState, Field, Select, Textarea } from "@/components/ui";
import {
  CATEGORY_LABEL,
  isChoiceType,
  QUESTION_TYPE_LABEL,
  QUESTION_TYPES,
  SURVEY_CATEGORIES,
  type SurveyCategory,
  type SurveyQuestionType
} from "@/lib/survey-core";

export type EditableQuestion = {
  id: string;
  type: SurveyQuestionType;
  category: SurveyCategory;
  prompt: string;
  required: boolean;
  options: string[];
};

export function QuestionEditor({
  surveyId,
  questions,
  locked
}: {
  surveyId: string;
  questions: EditableQuestion[];
  locked: boolean;
}) {
  const [editing, setEditing] = useState<EditableQuestion | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  function move(questionId: string, direction: "up" | "down") {
    startTransition(async () => {
      try {
        const result = await moveSurveyQuestionAction(questionId, direction);
        if (result.error) toast.error(result.error);
        else markStale();
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <div className="grid gap-4">
      {locked ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Khảo sát đã có phiếu trả lời nên câu hỏi bị khóa, để kết quả không bị sai nghĩa.</span>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <EmptyState title="Chưa có câu hỏi">Thêm câu hỏi đầu tiên để bắt đầu.</EmptyState>
      ) : (
        <ol className="grid gap-2">
          {questions.map((question, index) => (
            <li
              key={question.id}
              className="flex items-start gap-3 rounded-xl border border-stone-200/80 bg-white p-3 sm:p-4"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-stone-100 text-xs font-bold text-stone-600">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-neutralText">
                  {question.prompt}
                  {question.required ? <span className="text-warning"> *</span> : null}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge tone="primary">{QUESTION_TYPE_LABEL[question.type]}</Badge>
                  <Badge>{CATEGORY_LABEL[question.category]}</Badge>
                </div>
                {question.options.length > 0 ? (
                  <p className="mt-2 text-xs text-stone-500">{question.options.join(" · ")}</p>
                ) : null}
              </div>
              {locked ? null : (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 px-0 text-stone-500"
                    disabled={pending || index === 0}
                    onClick={() => move(question.id, "up")}
                    aria-label="Đưa lên"
                    title="Đưa lên"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 px-0 text-stone-500"
                    disabled={pending || index === questions.length - 1}
                    onClick={() => move(question.id, "down")}
                    aria-label="Đưa xuống"
                    title="Đưa xuống"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 px-0 text-stone-500"
                    onClick={() => setEditing(question)}
                    aria-label="Sửa câu hỏi"
                    title="Sửa câu hỏi"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ConfirmDeleteButton
                    id={question.id}
                    action={deleteSurveyQuestionAction}
                    title="Xóa câu hỏi"
                    description={<>Xóa câu hỏi “{question.prompt}”?</>}
                    iconOnly
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {locked ? null : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Thêm câu hỏi
          </Button>
        </div>
      )}

      {editing ? (
        <QuestionDialog
          surveyId={surveyId}
          question={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function QuestionDialog({
  surveyId,
  question,
  onClose
}: {
  surveyId: string;
  question: EditableQuestion | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(saveSurveyQuestionAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  const [type, setType] = useState<SurveyQuestionType>(question?.type ?? "rating");

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Modal title={question ? "Sửa câu hỏi" : "Thêm câu hỏi"} onClose={() => !pending && onClose()} closeDisabled={pending}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="surveyId" value={surveyId} />
        <input type="hidden" name="questionId" value={question?.id ?? ""} />
        <Field label="Nội dung câu hỏi">
          <Textarea name="prompt" required maxLength={300} rows={2} defaultValue={question?.prompt ?? ""} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Loại câu hỏi">
            <Select name="type" value={type} onChange={(event) => setType(event.target.value as SurveyQuestionType)}>
              {QUESTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {QUESTION_TYPE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nhóm đánh giá">
            <Select name="category" defaultValue={question?.category ?? "other"}>
              {SURVEY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {isChoiceType(type) ? (
          <Field label="Các lựa chọn" hint="Mỗi dòng một lựa chọn">
            <Textarea
              name="options"
              rows={4}
              defaultValue={question?.options.join("\n") ?? ""}
              placeholder={"Ít\nVừa đủ\nNhiều"}
            />
          </Field>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            name="required"
            defaultChecked={question?.required ?? true}
            className="h-4 w-4 cursor-pointer accent-primary"
          />
          Bắt buộc trả lời
        </label>
        <p className="text-xs text-stone-500">
          Câu chấm sao tính vào điểm của nhóm đánh giá; câu nhóm “Giáo viên” tự gắn với giáo viên của lớp nhận link.
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
            <Save className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu câu hỏi"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
