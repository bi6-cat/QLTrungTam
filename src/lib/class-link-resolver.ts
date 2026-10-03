import { legacyClassLinksActive, parseClassLinkSlug, payPath, teacherPath } from "@/lib/class-links";
import { prisma } from "@/lib/prisma";

export type ClassLinkKind = "pay" | "teacher";

export type ResolvedClassLink =
  | { kind: "class"; classId: string }
  | { kind: "redirect"; redirectTo: string }
  | null;

/**
 * Tìm lớp từ phần cuối URL công khai.
 * - Link mới: mã ngẫu nhiên đúng loại (phụ huynh/giáo viên) VÀ mã lớp phải khớp.
 * - Link 4 ký tự cũ: trong thời gian chuyển tiếp thì trả về link mới cùng loại để chuyển hướng.
 */
export async function resolveClassLink(slug: string, kind: ClassLinkKind): Promise<ResolvedClassLink> {
  const parsed = parseClassLinkSlug(slug);
  if (parsed) {
    const classRoom = await prisma.classRoom.findUnique({
      where: kind === "pay" ? { publicToken: parsed.token } : { teacherToken: parsed.token },
      select: { id: true, shortCode: true }
    });
    if (!classRoom || classRoom.shortCode.toUpperCase() !== parsed.shortCode) return null;
    return { kind: "class", classId: classRoom.id };
  }

  if (!legacyClassLinksActive()) return null;
  const legacy = await prisma.classRoom.findUnique({
    where: { legacyToken: slug },
    select: { shortCode: true, publicToken: true, teacherToken: true }
  });
  if (!legacy) return null;
  return { kind: "redirect", redirectTo: kind === "pay" ? payPath(legacy) : teacherPath(legacy) };
}
