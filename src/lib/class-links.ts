// Link công khai của lớp có dạng <MÃ LỚP>-<mã ngẫu nhiên>, ví dụ /pay/L10A-k7m2x9pq4r.
// Mã lớp giúp admin nhìn là biết link của lớp nào, tránh gửi nhầm nhóm; phần ngẫu nhiên
// mới là thứ bảo vệ dữ liệu. Server kiểm tra cả hai phải khớp cùng một lớp.

/** Link 4 ký tự cũ còn tự chuyển sang link mới đến hết ngày 30/11/2026, sau đó báo không tìm thấy. */
export const LEGACY_CLASS_LINKS_UNTIL = new Date("2026-12-01T00:00:00+07:00");

export function legacyClassLinksActive(now = new Date()) {
  return now.getTime() < LEGACY_CLASS_LINKS_UNTIL.getTime();
}

export function classLinkSlug(shortCode: string, token: string) {
  return `${shortCode.toUpperCase()}-${token}`;
}

/**
 * Tách "<MÃ LỚP>-<mã>" theo dấu gạch cuối cùng (mã lớp có thể chứa "-", mã ngẫu nhiên thì
 * không). Trả về null khi không có dấu gạch — đó là link cũ.
 */
export function parseClassLinkSlug(slug: string) {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const index = decoded.lastIndexOf("-");
  if (index <= 0 || index === decoded.length - 1) return null;
  return {
    shortCode: decoded.slice(0, index).toUpperCase(),
    token: decoded.slice(index + 1).toLowerCase()
  };
}

export function payPath(classRoom: { shortCode: string; publicToken: string }) {
  return `/pay/${classLinkSlug(classRoom.shortCode, classRoom.publicToken)}`;
}

export function teacherPath(classRoom: { shortCode: string; teacherToken: string }) {
  return `/teacher/classes/${classLinkSlug(classRoom.shortCode, classRoom.teacherToken)}`;
}

export function absoluteUrl(appUrl: string, path: string) {
  return `${appUrl.replace(/\/$/, "")}${path}`;
}
