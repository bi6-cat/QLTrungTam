"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";

function compactReference(value: string) {
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

export function TransactionReference({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  async function copyReference() {
    let didCopy = false;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
        didCopy = true;
      }
    } catch {
      // HTTP nội bộ có thể không cấp Clipboard API; dùng fallback bên dưới.
    }

    if (!didCopy) {
      const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      try {
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        didCopy = document.execCommand("copy");
      } catch {
        didCopy = false;
      } finally {
        textarea.remove();
        if (previouslyFocused?.isConnected) previouslyFocused.focus();
      }
    }

    setCopied(didCopy);
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap" title={value}>
      <span className="min-w-0 overflow-hidden text-ellipsis font-mono text-xs">
        {compactReference(value)}
      </span>
      <button
        type="button"
        onClick={copyReference}
        className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-100 hover:text-primary"
        aria-label={copied ? "Đã sao chép mã giao dịch" : "Sao chép mã giao dịch đầy đủ"}
        title={copied ? "Đã sao chép" : "Sao chép mã đầy đủ"}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
