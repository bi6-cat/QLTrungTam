"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

function shift(month: number, year: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

/**
 * Chọn tháng xem dữ liệu: nút ‹ › sang tháng trước/sau, bấm vào nhãn để chọn nhanh tháng bất kỳ.
 * Giữ nguyên các tham số lọc khác của trang qua `params`.
 */
export function MonthSwitcher({
  basePath,
  month,
  year,
  params = {}
}: {
  basePath: string;
  month: number;
  year: number;
  params?: Record<string, string | undefined | null>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(year);
  const boxRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const isCurrent = month === currentMonth && year === currentYear;

  const href = (targetMonth: number, targetYear: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
    search.set("month", String(targetMonth));
    search.set("year", String(targetYear));
    return `${basePath}?${search.toString()}`;
  };
  const previous = shift(month, year, -1);
  const next = shift(month, year, 1);

  useEffect(() => {
    if (!open) return;
    setPickerYear(year);
    function onPointer(event: PointerEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, year]);

  function go(targetMonth: number, targetYear: number) {
    setOpen(false);
    startTransition(() => router.push(href(targetMonth, targetYear)));
  }

  const navButton =
    "focus-ring grid h-9 w-9 place-items-center rounded-lg text-stone-600 transition-colors hover:bg-stone-100 hover:text-neutralText";

  return (
    <div ref={boxRef} className="relative flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-xl border border-stone-300 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => go(previous.month, previous.year)}
          className={navButton}
          title={`Tháng ${previous.month}/${previous.year}`}
          aria-label="Tháng trước"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="focus-ring inline-flex h-9 min-w-[150px] items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-neutralText transition-colors hover:bg-stone-100"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <CalendarDays className="h-4 w-4 text-primary" />
          )}
          Tháng {month}/{year}
        </button>
        <button
          type="button"
          onClick={() => go(next.month, next.year)}
          className={navButton}
          title={`Tháng ${next.month}/${next.year}`}
          aria-label="Tháng sau"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {!isCurrent ? (
        <button
          type="button"
          onClick={() => go(currentMonth, currentYear)}
          className="focus-ring h-9 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-indigo-50"
        >
          Về tháng này
        </button>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-label="Chọn tháng"
          className="absolute left-0 top-full z-40 mt-2 w-72 animate-scale-in sm:left-auto sm:right-0 rounded-2xl border border-stone-200 bg-white p-3 shadow-lift"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className={navButton}
              onClick={() => setPickerYear((value) => value - 1)}
              aria-label="Năm trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold">Năm {pickerYear}</span>
            <button
              type="button"
              className={navButton}
              onClick={() => setPickerYear((value) => value + 1)}
              aria-label="Năm sau"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => {
              const selected = value === month && pickerYear === year;
              const today = value === currentMonth && pickerYear === currentYear;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => go(value, pickerYear)}
                  className={`focus-ring h-10 rounded-lg text-sm font-semibold transition-colors ${
                    selected
                      ? "bg-primary text-white shadow-sm"
                      : today
                        ? "bg-indigo-50 text-primary ring-1 ring-inset ring-indigo-200 hover:bg-indigo-100"
                        : "text-stone-700 hover:bg-stone-100"
                  }`}
                >
                  T{value}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
