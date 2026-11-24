"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { DEFAULT_THEME, THEMES, THEME_COOKIE, type ThemeId } from "@/lib/themes";

/** Nút đổi bộ màu giao diện. Lưu vào cookie của trình duyệt này (1 năm), áp dụng ngay không cần tải lại. */
export function ThemePicker({ initial }: { initial: ThemeId | null }) {
  const [current, setCurrent] = useState<ThemeId | null>(initial);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function choose(id: ThemeId) {
    setCurrent(id);
    document.documentElement.dataset.theme = id;
    document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
  }

  const active = current ?? DEFAULT_THEME;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Đổi màu giao diện"
        aria-expanded={open}
        title="Đổi màu giao diện"
        className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-primary"
      >
        <Palette className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-50 w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-card">
          <p className="px-2.5 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-stone-500">Màu giao diện</p>
          {THEMES.map((theme) => {
            const selected = theme.id === active;
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => choose(theme.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-stone-100 ${
                  selected ? "font-semibold text-stone-900" : "text-stone-700"
                }`}
              >
                <span className="flex overflow-hidden rounded-md border border-stone-200">
                  {theme.swatch.map((color) => (
                    <span key={color} className="h-5 w-4" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className="flex-1">{theme.label}</span>
                {selected ? <Check className="h-4 w-4 text-primary" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
