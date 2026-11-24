// Bộ màu giao diện người dùng tự chọn. Giá trị màu thật nằm trong globals.css
// (`:root[data-theme="…"]`); ở đây chỉ có tên và màu mẫu cho nút chọn.
export const THEME_COOKIE = "qltt_theme";
export const DEFAULT_THEME = "cham";

export const THEMES = [
  { id: "cham", label: "Chàm", swatch: ["#3730A3", "#818CF8", "#E0E7FF"] },
  { id: "bien", label: "Xanh biển", swatch: ["#1E40AF", "#60A5FA", "#DBEAFE"] },
  { id: "ngoc", label: "Ngọc lam", swatch: ["#115E59", "#2DD4BF", "#CCFBF1"] },
  { id: "tim", label: "Tím mận", swatch: ["#6B21A8", "#C084FC", "#F3E8FF"] },
  { id: "than", label: "Than chì", swatch: ["#1E293B", "#94A3B8", "#F1F5F9"] }
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
