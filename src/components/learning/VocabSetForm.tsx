"use client";

import { Eye, Save } from "lucide-react";
import { saveVocabSetAction, type VocabSetFormState } from "@/app/teacher/(portal)/vocab/actions";
import { useKeepValuesAction } from "@/components/useKeepValuesAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const EMPTY: VocabSetFormState = { error: "", lineErrors: [], preview: null };

const PLACEHOLDER = `apple (n) - quả táo | I eat an apple every day.
run (v) - chạy
well-known - nổi tiếng
colour / color - màu sắc`;

export function VocabSetForm({ setId, defaultTitle = "", defaultWords = "" }: { setId?: string; defaultTitle?: string; defaultWords?: string }) {
  const [state, onSubmit, pending] = useKeepValuesAction(saveVocabSetAction, EMPTY);

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {setId ? <input type="hidden" name="setId" value={setId} /> : null}
      <Field label="Tên bộ từ">
        <Input name="title" defaultValue={defaultTitle} placeholder="vd: Unit 3 - Animals" required maxLength={120} />
      </Field>
      <Field label="Danh sách từ" hint="mỗi dòng một từ">
        <Textarea name="words" defaultValue={defaultWords} placeholder={PLACEHOLDER} rows={14} spellCheck={false} required className="font-mono text-sm" />
      </Field>
      <details className="rounded-xl bg-stone-50 px-3 py-2 text-sm text-stone-600">
        <summary className="cursor-pointer font-medium text-stone-700">Cách viết</summary>
        <ul className="mt-2 grid list-disc gap-1 pl-5">
          <li>
            <code>từ - nghĩa</code>, cũng được dùng <code>:</code> hoặc <code>=</code> thay cho <code>-</code>.
          </li>
          <li>
            Từ loại trong ngoặc sau từ: <code>apple (n) - quả táo</code>.
          </li>
          <li>
            Câu ví dụ sau dấu <code>|</code>. Từ có nhiều cách viết: <code>colour / color</code>, học sinh gõ cách nào cũng đúng.
          </li>
          <li>Copy 2–4 cột từ Excel (từ, nghĩa, từ loại, ví dụ) rồi dán thẳng vào cũng được.</li>
        </ul>
      </details>

      {state.lineErrors.length > 0 ? (
        <ul className="grid gap-1 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.lineErrors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ) : null}
      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}

      {state.preview && state.preview.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-neutralText">Đọc được {state.preview.length} từ:</p>
          <div className="max-h-80 overflow-auto rounded-xl border border-stone-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Từ</th>
                  <th className="px-3 py-2">Nghĩa</th>
                  <th className="px-3 py-2">Ví dụ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {state.preview.map((w) => (
                  <tr key={w.term}>
                    <td className="px-3 py-1.5 font-medium">
                      {w.term}
                      {w.partOfSpeech ? <span className="ml-1 text-xs text-stone-400">({w.partOfSpeech})</span> : null}
                    </td>
                    <td className="px-3 py-1.5">{w.meaning}</td>
                    <td className="px-3 py-1.5 text-stone-500">{w.example}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="preview" variant="secondary" disabled={pending}>
          <Eye className="h-4 w-4" />
          Xem trước
        </Button>
        <Button type="submit" name="intent" value="save" disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Đang lưu..." : "Lưu bộ từ"}
        </Button>
      </div>
    </form>
  );
}
