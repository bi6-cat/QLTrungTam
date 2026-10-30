import { prisma } from "@/modules/core";
import { LearningError } from "../errors";
import { assertVocabEnabled } from "./access";
import { MAX_WORDS_PER_SET, termKey, type ParsedWord } from "./word-list";

const MAX_TITLE = 120;

function checkSet(title: string, words: readonly ParsedWord[]) {
  const clean = title.trim();
  if (!clean) throw new LearningError("Nhập tên bộ từ.");
  if (clean.length > MAX_TITLE) throw new LearningError(`Tên bộ từ tối đa ${MAX_TITLE} ký tự.`);
  if (words.length === 0) throw new LearningError("Bộ từ cần ít nhất một từ.");
  if (words.length > MAX_WORDS_PER_SET) throw new LearningError(`Một bộ tối đa ${MAX_WORDS_PER_SET} từ.`);
  return clean;
}

export async function listVocabSets(teacherId: string) {
  const sets = await prisma.vocabSet.findMany({
    where: { teacherId, archivedAt: null },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, _count: { select: { words: true, quizzes: true } } }
  });
  return sets.map(({ _count, ...set }) => ({ ...set, wordCount: _count.words, assignmentCount: _count.quizzes }));
}

/** Bộ từ của chính giáo viên này (chưa lưu trữ); null nếu không có hoặc của người khác. */
export async function getVocabSet(teacherId: string, setId: string) {
  return prisma.vocabSet.findFirst({
    where: { id: setId, teacherId, archivedAt: null },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      words: {
        orderBy: { position: "asc" },
        select: { id: true, term: true, meaning: true, partOfSpeech: true, example: true }
      }
    }
  });
}

export async function createVocabSet(teacherId: string, title: string, words: readonly ParsedWord[]) {
  const cleanTitle = checkSet(title, words);
  await assertVocabEnabled(teacherId);
  return prisma.vocabSet.create({
    data: { teacherId, title: cleanTitle, words: { create: words.map((w, position) => ({ ...w, position })) } },
    select: { id: true }
  });
}

/**
 * Thay nội dung bộ từ. Từ giữ nguyên chữ (không phân biệt hoa thường) được cập nhật tại chỗ để giữ
 * thống kê "từ hay sai" của bài cũ; từ bỏ đi thì xoá (câu đã làm vẫn còn, chỉ mất liên kết từ).
 */
export async function updateVocabSet(teacherId: string, setId: string, title: string, words: readonly ParsedWord[]) {
  const cleanTitle = checkSet(title, words);
  await assertVocabEnabled(teacherId);
  await prisma.$transaction(async (tx) => {
    const set = await tx.vocabSet.findFirst({
      where: { id: setId, teacherId, archivedAt: null },
      select: { words: { select: { id: true, term: true } } }
    });
    if (!set) throw new LearningError("Không tìm thấy bộ từ.");
    const existing = new Map(set.words.map((w) => [termKey(w.term), w.id]));
    const kept = new Set<string>();
    for (const [position, word] of words.entries()) {
      const id = existing.get(termKey(word.term));
      if (id) {
        kept.add(id);
        await tx.vocabWord.update({ where: { id }, data: { ...word, position } });
      } else {
        await tx.vocabWord.create({ data: { ...word, position, setId } });
      }
    }
    const removed = set.words.filter((w) => !kept.has(w.id)).map((w) => w.id);
    if (removed.length > 0) await tx.vocabWord.deleteMany({ where: { id: { in: removed } } });
    await tx.vocabSet.update({ where: { id: setId }, data: { title: cleanTitle } });
  });
}

export async function archiveVocabSet(teacherId: string, setId: string) {
  const updated = await prisma.vocabSet.updateMany({ where: { id: setId, teacherId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (updated.count !== 1) throw new LearningError("Không tìm thấy bộ từ.");
}
