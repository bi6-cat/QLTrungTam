import { prisma } from "@/modules/core";
import { isTeacherOfClass, listClassesForStudent, listClassesForTeacher } from "@/modules/center";
import { LearningError } from "./errors";

export const MAX_MATERIAL_TITLE = 120;
export const MAX_MATERIAL_NOTE = 2000;
const MAX_URL = 2000;

export type MaterialInput = { classId: string; title: string; url: string; note: string };

/**
 * Đường dẫn giáo viên dán vào → URL đầy đủ, hoặc null nếu để trống. Thiếu "https://" thì tự thêm
 * (hay dán "drive.google.com/…"). Chỉ nhận http/https: học sinh bấm thẳng vào nên không để lọt
 * javascript:, data:…
 */
export function normalizeMaterialUrl(raw: string) {
  const text = raw.trim();
  if (!text) return null;
  if (text.length > MAX_URL) throw new LearningError("Đường dẫn quá dài.");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    throw new LearningError("Đường dẫn không hợp lệ.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new LearningError("Chỉ nhận đường dẫn bắt đầu bằng http:// hoặc https://.");
  if (!url.hostname.includes(".")) throw new LearningError("Đường dẫn không hợp lệ.");
  return url.href;
}

/** Tên trang của đường dẫn để hiện cạnh tài liệu, vd "drive.google.com". */
export function materialHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Kiểm tra và làm sạch nội dung tài liệu (không đụng DB). Cần ít nhất đường dẫn hoặc ghi chú. */
export function checkMaterialInput(input: Pick<MaterialInput, "title" | "url" | "note">) {
  const title = input.title.trim();
  if (!title) throw new LearningError("Nhập tên tài liệu.");
  if (title.length > MAX_MATERIAL_TITLE) throw new LearningError(`Tên tài liệu tối đa ${MAX_MATERIAL_TITLE} ký tự.`);
  const url = normalizeMaterialUrl(input.url);
  const note = input.note.replace(/\r\n/g, "\n").trim();
  if (note.length > MAX_MATERIAL_NOTE) throw new LearningError(`Ghi chú tối đa ${MAX_MATERIAL_NOTE} ký tự.`);
  if (!url && !note) throw new LearningError("Dán đường dẫn tài liệu hoặc viết ghi chú.");
  return { title, url, note };
}

const materialSelect = { id: true, title: true, url: true, note: true, createdAt: true, updatedAt: true } as const;

/** Người đăng, hoặc giáo viên đang dạy lớp đó (lớp đổi giáo viên thì người mới quản lý tiếp). */
async function loadManagedMaterial(teacherId: string, materialId: string) {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    select: { ...materialSelect, classId: true, teacherId: true, classRoom: { select: { name: true } } }
  });
  if (!material) return null;
  if (material.teacherId === teacherId || (await isTeacherOfClass(teacherId, material.classId))) return material;
  return null;
}

export async function createMaterial(teacherId: string, input: MaterialInput) {
  const data = checkMaterialInput(input);
  if (!(await isTeacherOfClass(teacherId, input.classId))) throw new LearningError("Thầy cô không được gán dạy lớp này.");
  return prisma.material.create({ data: { ...data, classId: input.classId, teacherId }, select: { id: true } });
}

/** Sửa tài liệu; chuyển sang lớp khác thì phải là lớp thầy cô đang dạy. */
export async function updateMaterial(teacherId: string, materialId: string, input: MaterialInput) {
  const data = checkMaterialInput(input);
  const material = await loadManagedMaterial(teacherId, materialId);
  if (!material) throw new LearningError("Không tìm thấy tài liệu.");
  if (input.classId !== material.classId && !(await isTeacherOfClass(teacherId, input.classId))) {
    throw new LearningError("Thầy cô không được gán dạy lớp này.");
  }
  await prisma.material.update({ where: { id: materialId }, data: { ...data, classId: input.classId } });
}

export async function deleteMaterial(teacherId: string, materialId: string) {
  const material = await loadManagedMaterial(teacherId, materialId);
  if (!material) throw new LearningError("Không tìm thấy tài liệu.");
  await prisma.material.delete({ where: { id: materialId } });
}

export async function getMaterialForTeacher(teacherId: string, materialId: string) {
  const material = await loadManagedMaterial(teacherId, materialId);
  if (!material) return null;
  const { classRoom, teacherId: _owner, ...rest } = material;
  return { ...rest, className: classRoom.name };
}

/**
 * Tài liệu theo lớp cho cổng giáo viên: mọi lớp đang dạy (kể cả lớp chưa có tài liệu), rồi các
 * lớp không còn dạy nhưng thầy cô từng đăng tài liệu. Tài liệu mới nhất trước.
 */
export async function listMaterialsForTeacher(teacherId: string, now = new Date()) {
  const classes = await listClassesForTeacher(teacherId, now);
  const materials = await prisma.material.findMany({
    where: { OR: [{ teacherId }, { classId: { in: classes.map((c) => c.id) } }] },
    orderBy: { createdAt: "desc" },
    select: { ...materialSelect, classId: true, classRoom: { select: { name: true } } }
  });
  const groups = new Map(classes.map((c) => [c.id, { classId: c.id, className: c.name, teaching: true, materials: [] as typeof materials }]));
  for (const m of materials) {
    if (!groups.has(m.classId)) groups.set(m.classId, { classId: m.classId, className: m.classRoom.name, teaching: false, materials: [] });
    groups.get(m.classId)!.materials.push(m);
  }
  return [...groups.values()].map((g) => ({ ...g, materials: g.materials.map(({ classRoom: _c, classId: _id, ...m }) => m) }));
}

/** Tài liệu của các lớp học sinh đang học (cùng tiêu chí với bài giao), nhóm theo lớp. */
export async function listMaterialsForStudent(studentId: string, now = new Date()) {
  const classes = await listClassesForStudent(studentId, now);
  if (classes.length === 0) return [];
  const materials = await prisma.material.findMany({
    where: { classId: { in: classes.map((c) => c.id) } },
    orderBy: { createdAt: "desc" },
    select: { ...materialSelect, classId: true }
  });
  return classes.map((c) => ({
    classId: c.id,
    className: c.name,
    teacherName: c.teacherName,
    materials: materials.filter((m) => m.classId === c.id).map(({ classId: _id, ...m }) => m)
  }));
}
