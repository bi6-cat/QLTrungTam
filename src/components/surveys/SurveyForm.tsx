"use client";

import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Star } from "lucide-react";
import { clsx } from "clsx";
import { submitSurveyAction } from "@/lib/actions/surveys";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import {
  answerFieldName,
  MAX_TEXT_ANSWER,
  RESPONDENT_LABEL,
  type SurveyAudience,
  type SurveyQuestionType
} from "@/lib/survey-core";

export type PublicQuestion = {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  options: string[];
};

const ring = "outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 focus-visible:ring-offset-white";

/**
 * Form khảo sát ẩn danh. Mọi ô đều có state riêng (controlled): React tự xóa form không
 * kiểm soát sau mỗi lần gửi action, nên phiếu bị báo lỗi sẽ mất hết câu trả lời nếu không giữ.
 */
export function SurveyForm({
  slug,
  audience,
  questions
}: {
  slug: string;
  audience: SurveyAudience;
  questions: PublicQuestion[];
}) {
  const submit = useMemo(() => submitSurveyAction.bind(null, slug), [slug]);
  const [state, action, pending] = useActionState(submit, EMPTY_RESULT_STATE);
  const [role, setRole] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});

  const setAnswer = (questionId: string, value: string | string[]) =>
    setAnswers((current) => ({ ...current, [questionId]: value }));

  if (state.success) {
    return (
      <div className="animate-scale-in rounded-3xl border border-ink/10 bg-white p-8 text-center sm:p-12">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </span>
        <h2 className="mt-5 font-display text-3xl text-ink">{state.success}</h2>
        <p className="mx-auto mt-3 max-w-sm leading-relaxed text-ink-muted">
          Phiếu đã được gửi ẩn danh. Mọi góp ý đều được trung tâm đọc kỹ để cải thiện việc dạy và học.
        </p>
      </div>
    );
  }

  const answeredCount = questions.filter((q) => {
    const value = answers[q.id];
    return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
  }).length;

  return (
    <form action={action} className="grid gap-4">
      {audience === "both" ? (
        <fieldset className="rounded-2xl border border-ink/10 bg-white p-5 sm:p-6">
          <legend className="sr-only">Bạn là</legend>
          <p className="font-semibold text-ink">
            Bạn là <span className="text-rose-600">*</span>
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(["student", "parent"] as const).map((value) => (
              <label
                key={value}
                className={clsx(
                  "flex cursor-pointer items-center justify-center rounded-xl border px-3 py-3 text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass",
                  role === value ? "border-ink bg-ink text-white" : "border-ink/15 text-ink hover:border-ink/30"
                )}
              >
                <input
                  type="radio"
                  name="respondentRole"
                  value={value}
                  required
                  checked={role === value}
                  onChange={() => setRole(value)}
                  className="sr-only"
                />
                {RESPONDENT_LABEL[value]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {questions.map((question, index) => (
        <fieldset key={question.id} className="rounded-2xl border border-ink/10 bg-white p-5 sm:p-6">
          <legend className="sr-only">{question.prompt}</legend>
          <p className="flex gap-3 font-semibold leading-snug text-ink">
            <span className="font-display text-lg font-normal text-brass-dark">{index + 1}.</span>
            <span>
              {question.prompt}
              {question.required ? <span className="text-rose-600"> *</span> : null}
            </span>
          </p>
          <div className="mt-4">
            <QuestionInput question={question} value={answers[question.id]} onChange={(value) => setAnswer(question.id, value)} />
          </div>
        </fieldset>
      ))}

      {state.error ? (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="sticky bottom-0 -mx-4 border-t border-ink/10 bg-ivory/90 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={pending}
          className={`${ring} inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-60`}
        >
          {pending ? "Đang gửi..." : "Gửi phiếu ẩn danh"}
          {pending ? null : <ArrowRight className="h-4 w-4" />}
        </button>
        <p className="mt-2 text-center text-xs text-ink-muted">
          Đã trả lời {answeredCount}/{questions.length} câu
        </p>
      </div>
    </form>
  );
}

function QuestionInput({
  question,
  value,
  onChange
}: {
  question: PublicQuestion;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}) {
  const name = answerFieldName(question.id);
  const single = typeof value === "string" ? value : "";

  if (question.type === "rating") {
    const selected = Number(single) || 0;
    return (
      <div>
        <div className="flex gap-1.5" role="radiogroup">
          {[1, 2, 3, 4, 5].map((star) => (
            <label
              key={star}
              className="grid h-12 w-12 cursor-pointer place-items-center rounded-xl transition-colors hover:bg-amber-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass"
              title={`${star} sao`}
            >
              <input
                type="radio"
                name={name}
                value={star}
                required={question.required}
                checked={selected === star}
                onChange={() => onChange(String(star))}
                className="sr-only"
                aria-label={`${star} sao`}
              />
              <Star
                className={clsx(
                  "h-8 w-8 transition-colors",
                  star <= selected ? "fill-amber-400 text-amber-400" : "text-stone-300"
                )}
                strokeWidth={1.5}
              />
            </label>
          ))}
        </div>
        <p className="mt-1.5 h-4 text-xs text-ink-muted">
          {["", "Rất không hài lòng", "Chưa hài lòng", "Bình thường", "Hài lòng", "Rất hài lòng"][selected]}
        </p>
      </div>
    );
  }

  if (question.type === "nps") {
    return (
      <div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup">
          {Array.from({ length: 11 }, (_, score) => (
            <label
              key={score}
              className={clsx(
                "grid h-11 cursor-pointer place-items-center rounded-lg border text-sm font-semibold tabular-nums transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass",
                single === String(score) ? "border-ink bg-ink text-white" : "border-ink/15 text-ink hover:border-ink/40"
              )}
            >
              <input
                type="radio"
                name={name}
                value={score}
                required={question.required}
                checked={single === String(score)}
                onChange={() => onChange(String(score))}
                className="sr-only"
              />
              {score}
            </label>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-muted">
          <span>0 = Chắc chắn không</span>
          <span>10 = Chắc chắn có</span>
        </div>
      </div>
    );
  }

  if (question.type === "single" || question.type === "multi") {
    const multi = question.type === "multi";
    const selected = multi ? (Array.isArray(value) ? value : []) : [single];
    return (
      <div className="grid gap-2">
        {multi ? <p className="-mt-1 mb-1 text-xs text-ink-muted">Có thể chọn nhiều đáp án.</p> : null}
        {question.options.map((option, optionIndex) => {
          const optionValue = String(optionIndex);
          const checked = selected.includes(optionValue);
          return (
            <label
              key={optionValue}
              className={clsx(
                "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass",
                checked ? "border-ink bg-ivory text-ink" : "border-ink/15 text-ink hover:border-ink/30"
              )}
            >
              <input
                type={multi ? "checkbox" : "radio"}
                name={name}
                value={optionValue}
                required={!multi && question.required}
                checked={checked}
                onChange={() => {
                  if (!multi) onChange(optionValue);
                  else onChange(checked ? selected.filter((v) => v !== optionValue) : [...selected, optionValue]);
                }}
                className="h-4 w-4 shrink-0 cursor-pointer accent-ink"
              />
              {option}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <textarea
        name={name}
        rows={4}
        maxLength={MAX_TEXT_ANSWER}
        required={question.required}
        value={single}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Viết thoải mái, phiếu không ghi tên…"
        className={`${ring} w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-muted/70 hover:border-ink/30 focus:border-ink/40`}
      />
      <p className="mt-1 text-right text-xs text-ink-muted">
        {single.length}/{MAX_TEXT_ANSWER}
      </p>
    </div>
  );
}
