"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui";

export function Modal({
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "max-w-lg",
  closeDisabled = false
}: {
  title: string;
  /** Một dòng giải thích nhỏ dưới tiêu đề. */
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
  closeDisabled?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // Bấm chuột phải bắt đầu ngay trên nền mờ mới tính là "bấm ra ngoài": bôi đen chữ trong ô nhập
  // rồi thả chuột ra ngoài khung không được đóng modal.
  const pressStartedOnBackdropRef = useRef(false);
  // Đã gõ vào form thì bấm ra ngoài không đóng (tránh mất dữ liệu); vẫn đóng bằng nút X, Hủy hoặc Esc.
  const dirtyRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
    closeDisabledRef.current = closeDisabled;
  }, [closeDisabled, onClose]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const dialog = dialogRef.current;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialog) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    // Khóa cuộn nền khi mở modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [mounted]);

  if (!mounted) return null;

  // Portal ra body để không bị ảnh hưởng bởi ancestor có transform/overflow
  // (nếu không, position: fixed sẽ neo theo phần tử cha đã transform).
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-stone-900/45 p-4"
      onPointerDown={(event) => {
        pressStartedOnBackdropRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        const startedOnBackdrop = pressStartedOnBackdropRef.current;
        pressStartedOnBackdropRef.current = false;
        if (event.target !== event.currentTarget || !startedOnBackdrop) return;
        if (closeDisabled || dirtyRef.current) return;
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-panel flex max-h-[90vh] w-full ${maxWidthClassName} animate-scale-in flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl outline-none`}
        onInput={() => {
          dirtyRef.current = true;
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-6 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-base font-bold text-neutralText">{title}</h3>
            {description ? <p className="mt-0.5 text-[13px] leading-snug text-stone-500">{description}</p> : null}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="-mr-2 h-8 w-8 shrink-0 px-0 text-stone-500"
            onClick={onClose}
            disabled={closeDisabled}
            title="Đóng"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>
        <div className="modal-body min-h-0 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
