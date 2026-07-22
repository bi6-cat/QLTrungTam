"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";

export function TransactionDetailsButton({
  title,
  details
}: {
  title: string;
  details: string[];
}) {
  const [open, setOpen] = useState(false);

  if (details.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-7 w-7 shrink-0 px-0 text-amber-700"
        onClick={() => setOpen(true)}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={title}
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div className="grid gap-2">
            {details.map((detail, index) => (
              <p key={`${index}-${detail}`} className="rounded-xl bg-stone-50 p-3 text-sm text-stone-700">
                {detail}
              </p>
            ))}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
