"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

type ToastTone = "success" | "error" | "info";
type ToastItem = { id: number; tone: ToastTone; message: string };

// Kho thông báo dùng chung toàn trang: component nào cũng gọi được toast.success(...)
// mà không cần bọc Provider; <Toaster /> trong layout admin lo phần hiển thị.
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<(items: ToastItem[]) => void>();

function emit() {
  for (const listener of listeners) listener(items);
}

function dismiss(id: number) {
  items = items.filter((item) => item.id !== id);
  emit();
}

function show(message: string, tone: ToastTone) {
  const text = message.trim();
  if (!text) return;
  const id = nextId++;
  items = [...items, { id, tone, message: text }].slice(-4);
  emit();
  window.setTimeout(() => dismiss(id), tone === "error" ? 7000 : 4000);
}

export const toast = {
  success: (message: string) => show(message, "success"),
  error: (message: string) => show(message, "error"),
  info: (message: string) => show(message, "info")
};

/**
 * Hiện thông báo theo kết quả của server action ({ error, success }). Mỗi lần action trả
 * về là một object mới nên effect chạy đúng một lần cho mỗi kết quả.
 */
export function useResultToast(
  state: { error?: string; success?: string },
  options: { showError?: boolean } = {}
) {
  const showError = options.showError ?? false;
  useEffect(() => {
    if (state.success) toast.success(state.success);
    else if (showError && state.error) toast.error(state.error);
  }, [state, showError]);
}

const TONE_STYLE: Record<ToastTone, { box: string; icon: React.ReactNode }> = {
  success: {
    box: "border-emerald-200 bg-white text-emerald-800",
    icon: <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
  },
  error: {
    box: "border-rose-200 bg-white text-rose-800",
    icon: <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
  },
  info: {
    box: "border-indigo-200 bg-white text-indigo-800",
    icon: <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
  }
};

export function Toaster() {
  const [visible, setVisible] = useState<ToastItem[]>(items);

  useEffect(() => {
    listeners.add(setVisible);
    return () => {
      listeners.delete(setVisible);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[60] grid w-[min(92vw,380px)] gap-2"
    >
      {visible.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex animate-scale-in items-start gap-3 rounded-xl border p-3.5 text-sm font-medium shadow-lift ${TONE_STYLE[item.tone].box}`}
        >
          {TONE_STYLE[item.tone].icon}
          <p className="min-w-0 flex-1 leading-snug">{item.message}</p>
          <button
            type="button"
            onClick={() => dismiss(item.id)}
            className="focus-ring -m-1 rounded-md p-1 text-stone-400 hover:text-stone-600"
            aria-label="Đóng thông báo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
