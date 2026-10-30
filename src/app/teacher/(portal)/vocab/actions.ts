"use server";

import { redirect } from "next/navigation";
import { errorState, successState, type ResultState } from "@/lib/action-states";
import { requireTeacher } from "@/modules/identity";
import {
  archiveVocabSet,
  createVocabSet,
  LearningError,
  MAX_WORD_FILE_BYTES,
  parseWordList,
  readWordFile,
  updateVocabSet,
  VOCAB_DISABLED_MESSAGE,
  type ParsedWord
} from "@/modules/learning";

export type VocabSetFormState = { error: string; lineErrors: string[]; preview: ParsedWord[] | null };

const MAX_TEXT = 60_000;

/** "Xem trước" chỉ đọc danh sách; "Lưu" đọc rồi lưu, còn dòng lỗi thì không lưu. */
export async function saveVocabSetAction(_prev: VocabSetFormState, formData: FormData): Promise<VocabSetFormState> {
  const teacher = await requireTeacher();
  const setId = String(formData.get("setId") ?? "") || null;
  const title = String(formData.get("title") ?? "").slice(0, 200);
  const text = String(formData.get("words") ?? "");
  if (text.length > MAX_TEXT) return { error: "Danh sách quá dài, hãy tách thành nhiều bộ.", lineErrors: [], preview: null };

  const { words, errors } = parseWordList(text);
  if (errors.length > 0) {
    return { error: "Còn dòng chưa đúng dạng, sửa rồi lưu lại.", lineErrors: errors.map((e) => e.message), preview: words };
  }
  if (words.length === 0) return { error: "Dán ít nhất một từ, mỗi dòng một từ.", lineErrors: [], preview: null };
  if (formData.get("intent") !== "save") return { error: "", lineErrors: [], preview: words };

  let savedId: string;
  try {
    if (setId) {
      await updateVocabSet(teacher.id, setId, title, words);
      savedId = setId;
    } else {
      savedId = (await createVocabSet(teacher.id, title, words)).id;
    }
  } catch (saveError) {
    if (saveError instanceof LearningError) return { error: saveError.message, lineErrors: [], preview: words };
    console.error("Không lưu được bộ từ.", saveError);
    return { error: "Không lưu được bộ từ. Vui lòng tải lại trang và thử lại.", lineErrors: [], preview: words };
  }
  redirect(`/teacher/vocab/${savedId}?saved=1`);
}

export async function archiveVocabSetAction(setId: string): Promise<ResultState> {
  const teacher = await requireTeacher();
  try {
    await archiveVocabSet(teacher.id, String(setId));
    return successState("Đã lưu trữ bộ từ. Bài đã giao vẫn giữ nguyên.");
  } catch (archiveError) {
    if (archiveError instanceof LearningError) return errorState(archiveError.message);
    console.error("Không lưu trữ được bộ từ.", archiveError);
    return errorState("Không lưu trữ được bộ từ. Vui lòng tải lại trang và thử lại.");
  }
}

export type WordFileState = { error: string; text: string; count: number };

/** Đọc file danh sách từ (Excel, CSV, Quizlet) thành văn bản điền vào ô "Danh sách từ"; chưa lưu gì. */
export async function importWordFileAction(formData: FormData): Promise<WordFileState> {
  const teacher = await requireTeacher();
  if (!teacher.vocabEnabled) return { error: VOCAB_DISABLED_MESSAGE, text: "", count: 0 };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Chọn file danh sách từ.", text: "", count: 0 };
  if (file.size > MAX_WORD_FILE_BYTES) return { error: "File quá lớn (tối đa 1 MB). Hãy tách thành nhiều bộ.", text: "", count: 0 };
  try {
    const result = await readWordFile(file.name, new Uint8Array(await file.arrayBuffer()));
    return result.ok ? { error: "", text: result.text, count: result.count } : { error: result.error, text: "", count: 0 };
  } catch (readError) {
    console.error("Không đọc được file danh sách từ.", readError);
    return { error: "Không đọc được file. Vui lòng kiểm tra lại file và thử lại.", text: "", count: 0 };
  }
}
