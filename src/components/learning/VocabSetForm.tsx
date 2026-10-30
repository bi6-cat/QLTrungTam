"use client";

import { useRef, useState, useTransition } from "react";
import { Download, Eye, FileUp, Save } from "lucide-react";
import { importWordFileAction, saveVocabSetAction, type VocabSetFormState } from "@/app/teacher/(portal)/vocab/actions";
import { useKeepValuesAction } from "@/components/useKeepValuesAction";
import { Button, Field, Input, Textarea } from "@/components/ui";

const EMPTY: VocabSetFormState = { error: "", lineErrors: [], preview: null };

const PLACEHOLDER = `apple (n) - quả táo | I eat an apple every day.
run (v) - chạy
well-known - nổi tiếng
colour / color - màu sắc`;

const FILE_ACCEPT = ".xlsx,.csv,.tsv,.txt";

export function VocabSetForm({ setId, defaultTitle = "", defaultWords = "" }: { setId?: string; defaultTitle?: string; defaultWords?: string }) {
  const [state, onSubmit, pending] = useKeepValuesAction(saveVocabSetAction, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const wordsRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileMessage, setFileMessage] = useState({ error: "", info: "" });
  const [reading, startReading] = useTransition();

  /** Đọc file ở server, điền vào ô danh sách rồi bấm "Xem trước" luôn để thấy dòng lỗi (nếu có). */
  function onFile(file: File | undefined) {
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    startReading(async () => {
      try {
        const result = await importWordFileAction(data);
        if (result.error) return setFileMessage({ error: result.error, info: "" });
        if (wordsRef.current) wordsRef.current.value = result.text;
        setFileMessage({ error: "", info: `Đã đọc ${result.count} từ từ file "${file.name}". Kiểm tra bảng xem trước rồi bấm Lưu.` });
        formRef.current?.requestSubmit(previewRef.current);
      } catch {
        setFileMessage({ error: "Không kết nối được máy chủ. Vui lòng thử lại.", info: "" });
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
      {setId ? <input type="hidden" name="setId" value={setId} /> : null}
      <Field label="Tên bộ từ">
        <Input name="title" defaultValue={defaultTitle} placeholder="vd: Unit 3 - Animals" required maxLength={120} />
      </Field>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-stone-50 px-3 py-2.5 text-sm">
        <input ref={fileRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        <Button type="button" variant="secondary" disabled={reading || pending} onClick={() => fileRef.current?.click()}>
          <FileUp className="h-4 w-4" />
          {reading ? "Đang đọc file..." : "Tải file lên"}
        </Button>
        <span className="text-stone-600">Excel (.xlsx), CSV hoặc file .txt xuất từ Quizlet.</span>
        <a href="/teacher/vocab/template" className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg font-semibold text-primary hover:underline">
          <Download className="h-4 w-4" />
          File mẫu
        </a>
      </div>
      {fileMessage.error ? <p className="text-sm font-medium text-warning">{fileMessage.error}</p> : null}
      {fileMessage.info ? <p className="text-sm text-emerald-700">{fileMessage.info}</p> : null}
      <Field label="Danh sách từ" hint="mỗi dòng một từ">
        <Textarea ref={wordsRef} name="words" defaultValue={defaultWords} placeholder={PLACEHOLDER} rows={14} spellCheck={false} required className="font-mono text-sm" />
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
          <li>
            Tải file lên: cột A là từ, B là nghĩa, C từ loại, D ví dụ (dòng tiêu đề có hay không đều được). Quizlet: chọn Xuất (Export), để
            mặc định &quot;Tab&quot; giữa từ và nghĩa, lưu thành file .txt.
          </li>
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
        <Button ref={previewRef} type="submit" name="intent" value="preview" variant="secondary" disabled={pending}>
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
