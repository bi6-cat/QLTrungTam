"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { createAssignmentAction } from "@/app/teacher/(portal)/assignments/actions";
import { useKeepValuesAction } from "@/components/useKeepValuesAction";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Button, Field, Input, Select } from "@/components/ui";

type Option = { id: string; label: string };
type SetOption = Option & { wordCount: number };
type TypeOption = { value: string; label: string; choice: boolean };

export function AssignmentForm({
  classes,
  sets,
  types,
  defaultSetId,
  minWordsForChoice,
  maxAttempts,
  maxTimeLimit
}: {
  classes: Option[];
  sets: SetOption[];
  types: TypeOption[];
  defaultSetId?: string;
  minWordsForChoice: number;
  maxAttempts: number;
  maxTimeLimit: number;
}) {
  const [state, onSubmit, pending] = useKeepValuesAction(createAssignmentAction, EMPTY_RESULT_STATE);
  const [setId, setSetId] = useState(defaultSetId && sets.some((s) => s.id === defaultSetId) ? defaultSetId : sets[0]?.id ?? "");
  const [checked, setChecked] = useState(() => new Set(types.map((t) => t.value)));
  const wordCount = sets.find((s) => s.id === setId)?.wordCount ?? 0;
  const choiceBlocked = wordCount < minWordsForChoice;
  const activeTypes = types.filter((t) => checked.has(t.value) && !(t.choice && choiceBlocked)).length;
  const maxQuestions = Math.min(100, wordCount * activeTypes);

  return (
    <form onSubmit={onSubmit} className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Lớp">
          <Select name="classId" required defaultValue={classes[0]?.id}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Bộ từ">
          <Select name="setId" required value={setId} onChange={(e) => setSetId(e.target.value)}>
            {sets.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} ({s.wordCount} từ)
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Tên bài" hint="để trống thì lấy tên bộ từ">
        <Input name="title" maxLength={120} placeholder="vd: Kiểm tra từ vựng Unit 3" />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium text-stone-700">Dạng câu hỏi</legend>
        {types.map((t) => {
          const disabled = t.choice && choiceBlocked;
          return (
            <label key={t.value} className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="questionTypes"
                value={t.value}
                checked={checked.has(t.value) && !disabled}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(checked);
                  if (e.target.checked) next.add(t.value);
                  else next.delete(t.value);
                  setChecked(next);
                }}
                className="h-4 w-4 accent-primary"
              />
              <span className={disabled ? "text-stone-400" : ""}>
                {t.label}
                {disabled ? ` (cần bộ có từ ${minWordsForChoice} từ trở lên)` : ""}
              </span>
            </label>
          );
        })}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Số câu" hint={maxQuestions > 0 ? `tối đa ${maxQuestions}` : undefined}>
          <Input name="questionCount" type="number" inputMode="numeric" min={1} max={maxQuestions || 1} defaultValue={Math.min(10, maxQuestions || 1)} required />
        </Field>
        <Field label="Thời gian (phút)" hint="trống = không giới hạn">
          <Input name="timeLimitMinutes" type="number" inputMode="numeric" min={1} max={maxTimeLimit} placeholder="không giới hạn" />
        </Field>
        <Field label="Số lượt làm">
          <Input name="maxAttempts" type="number" inputMode="numeric" min={1} max={maxAttempts} defaultValue={1} required />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hạn nộp" hint="trống = không hạn">
          <Input name="dueAt" type="datetime-local" />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3 text-sm">
          <input type="checkbox" name="showAnswers" defaultChecked className="h-4 w-4 accent-primary" />
          Cho học sinh xem đáp án sau khi nộp
        </label>
      </div>

      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending || activeTypes === 0}>
          <Send className="h-4 w-4" />
          {pending ? "Đang giao..." : "Giao bài"}
        </Button>
      </div>
    </form>
  );
}
