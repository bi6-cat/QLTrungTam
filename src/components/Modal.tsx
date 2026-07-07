"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui";

export function Modal({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-lg"
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Khóa cuộn nền khi mở modal.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  if (!mounted) return null;

  // Portal ra body để không bị ảnh hưởng bởi ancestor có transform/overflow
  // (nếu không, position: fixed sẽ neo theo phần tử cha đã transform).
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-neutralText/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${maxWidthClassName} animate-scale-in overflow-y-auto rounded-2xl border border-stone-200/80 bg-white p-6 shadow-lift`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-bold tracking-tight text-neutralText">{title}</h3>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 px-0"
            onClick={onClose}
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
}
