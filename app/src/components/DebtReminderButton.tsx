"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui";
import { Modal } from "@/components/Modal";

export function DebtReminderButton({
  studentName,
  message,
  zaloUrl
}: {
  studentName: string;
  message: string;
  zaloUrl: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="h-9 whitespace-nowrap px-2.5 text-xs"
        onClick={() => setOpen(true)}
        title={`Soạn tin nhắc nợ cho ${studentName}`}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        Nhắc nợ
      </Button>
      {open ? (
        <ReminderDialog
          studentName={studentName}
          message={message}
          zaloUrl={zaloUrl}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReminderDialog({
  studentName,
  message,
  zaloUrl,
  onClose
}: {
  studentName: string;
  message: string;
  zaloUrl: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState(message);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bị chặn — người dùng vẫn bôi đen chép tay được */
    }
  }

  return (
    <Modal title={`Nhắc nợ · ${studentName}`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-stone-600">
          Nội dung đã soạn sẵn, có thể sửa trước khi gửi. Bấm <strong>Chép tin nhắn</strong> rồi{" "}
          <strong>Mở Zalo</strong> và dán vào khung chat.
        </p>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={14}
          className="focus-ring w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs leading-relaxed shadow-sm transition-colors hover:border-stone-400 focus:border-primary"
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button type="button" variant="secondary" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            {copied ? "Đã chép" : "Chép tin nhắn"}
          </Button>
          {zaloUrl ? (
            <a href={zaloUrl} target="_blank" rel="noopener noreferrer">
              <Button type="button">
                <Send className="h-4 w-4" />
                Mở Zalo
              </Button>
            </a>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}
