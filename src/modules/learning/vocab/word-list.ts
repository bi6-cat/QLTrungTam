// Đọc danh sách từ giáo viên dán vào: mỗi dòng một từ, dạng "apple (n) - quả táo | I eat an apple."
// Dán thẳng từ Excel (2–4 cột cách nhau bằng tab) cũng được: từ, nghĩa, [từ loại], [câu ví dụ].

export type ParsedWord = { term: string; meaning: string; partOfSpeech: string | null; example: string | null };
export type WordListError = { line: number; message: string };

export const MAX_WORDS_PER_SET = 300;
const MAX_TERM = 80;
const MAX_MEANING = 200;
const MAX_EXAMPLE = 300;

// Gạch nối phải có khoảng trắng hai bên để không cắt từ ghép như "well-known".
const SEPARATORS = [" - ", " – ", " — ", " = ", "=", ": ", ":"];
const POS_SUFFIX = /^(.*?)\s*\(\s*([a-zA-Z.]{1,8})\s*\)$/;
const POS_PREFIX = /^\(\s*([a-zA-Z.]{1,8})\s*\)\s*(.*)$/;

const clean = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();

/** Khoá so trùng từ: không phân biệt hoa/thường và khoảng trắng. */
export function termKey(term: string) {
  return clean(term).toLowerCase();
}

/** Tách ở dấu phân cách xuất hiện sớm nhất (cùng chỗ thì lấy dấu dài hơn, vd " = " thay vì "="). */
function splitPair(line: string): [string, string] | null {
  let best: { index: number; separator: string } | null = null;
  for (const separator of SEPARATORS) {
    const index = line.indexOf(separator);
    if (index <= 0) continue;
    if (!best || index < best.index || (index === best.index && separator.length > best.separator.length)) {
      best = { index, separator };
    }
  }
  return best ? [line.slice(0, best.index), line.slice(best.index + best.separator.length)] : null;
}

function parseLine(raw: string): ParsedWord | string {
  let example: string | null = null;
  let partOfSpeech: string | null = null;
  let term: string;
  let meaning: string;

  if (raw.includes("\t")) {
    const cells = raw.split("\t").map(clean);
    [term, meaning] = [cells[0] ?? "", cells[1] ?? ""];
    partOfSpeech = cells[2] || null;
    example = cells[3] || null;
  } else {
    let line = raw;
    const bar = line.indexOf(" | ");
    if (bar >= 0) {
      example = clean(line.slice(bar + 3)) || null;
      line = line.slice(0, bar);
    }
    const pair = splitPair(line);
    if (!pair) return "thiếu nghĩa (viết dạng: apple - quả táo)";
    [term, meaning] = pair.map(clean);
  }

  const suffix = POS_SUFFIX.exec(term);
  if (suffix) [term, partOfSpeech] = [clean(suffix[1]), suffix[2]];
  const prefix = POS_PREFIX.exec(meaning);
  if (prefix) [partOfSpeech, meaning] = [partOfSpeech ?? prefix[1], clean(prefix[2])];

  if (!term) return "thiếu từ tiếng Anh";
  if (!meaning) return "thiếu nghĩa (viết dạng: apple - quả táo)";
  if (term.length > MAX_TERM) return `từ dài quá ${MAX_TERM} ký tự`;
  if (meaning.length > MAX_MEANING) return `nghĩa dài quá ${MAX_MEANING} ký tự`;
  if (example && example.length > MAX_EXAMPLE) return `câu ví dụ dài quá ${MAX_EXAMPLE} ký tự`;
  return { term, meaning, partOfSpeech: partOfSpeech ? partOfSpeech.toLowerCase() : null, example };
}

/** Bỏ qua dòng trống và dòng bắt đầu bằng "#". Từ trùng (không phân biệt hoa thường) báo lỗi. */
export function parseWordList(text: string) {
  const words: ParsedWord[] = [];
  const errors: WordListError[] = [];
  const seen = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim() || raw.trim().startsWith("#")) return;
    const parsed = parseLine(raw);
    if (typeof parsed === "string") {
      errors.push({ line, message: `Dòng ${line}: ${parsed}.` });
      return;
    }
    const key = termKey(parsed.term);
    const firstLine = seen.get(key);
    if (firstLine) {
      errors.push({ line, message: `Dòng ${line}: "${parsed.term}" trùng với dòng ${firstLine}.` });
      return;
    }
    seen.set(key, line);
    words.push(parsed);
  });

  if (words.length > MAX_WORDS_PER_SET) {
    errors.push({ line: 0, message: `Một bộ tối đa ${MAX_WORDS_PER_SET} từ (đang có ${words.length}). Hãy tách thành nhiều bộ.` });
  }
  return { words, errors };
}

/** Viết lại bộ từ thành văn bản parseWordList đọc được (điền sẵn ô sửa bộ từ). */
export function formatWordList(words: readonly ParsedWord[]) {
  return words
    .map((w) => `${w.term}${w.partOfSpeech ? ` (${w.partOfSpeech})` : ""} - ${w.meaning}${w.example ? ` | ${w.example}` : ""}`)
    .join("\n");
}
