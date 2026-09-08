"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, ListChecks } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

type OverviewStatus = "unpaid" | "paid" | "waived" | "void" | "not_created" | "on_leave";

type OverviewRow = {
  studentName: string;
  status: OverviewStatus;
  sessions: number;
  amount: number;
};

const STATUS_META: Record<
  OverviewStatus,
  { label: string; tone: "success" | "warning" | "neutral" | "primary" }
> = {
  unpaid: { label: "Chưa đóng", tone: "warning" },
  paid: { label: "Đã đóng", tone: "success" },
  waived: { label: "Miễn học phí", tone: "primary" },
  void: { label: "Đã hủy", tone: "neutral" },
  not_created: { label: "Chưa tạo HĐ", tone: "neutral" },
  on_leave: { label: "Nghỉ học", tone: "neutral" }
};

export function CopyParentLinkButton({
  className,
  classShortCode,
  payUrl,
  month,
  year,
  rows
}: {
  className: string;
  classShortCode: string;
  payUrl: string;
  month: number;
  year: number;
  rows: OverviewRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <ListChecks className="h-4 w-4" />
        Xem DS &amp; gửi link
      </Button>
      {open ? (
        <ParentLinkDialog
          className={className}
          classShortCode={classShortCode}
          payUrl={payUrl}
          month={month}
          year={year}
          rows={rows}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ParentLinkDialog({
  className,
  classShortCode,
  payUrl,
  month,
  year,
  rows,
  onClose
}: {
  className: string;
  classShortCode: string;
  payUrl: string;
  month: number;
  year: number;
  rows: OverviewRow[];
  onClose: () => void;
}) {
  const defaultMessage = useMemo(
    () =>
      [
        `Kính gửi Quý phụ huynh lớp ${className} (${classShortCode}),`,
        "",
        `Trung tâm APLUS ACADEMY gửi link tra cứu và thanh toán học phí ${formatMonth(month, year)}:`,
        payUrl,
        "",
        "Phụ huynh vui lòng chọn đúng tên học sinh, kiểm tra số buổi và số tiền trước khi quét mã QR.",
        "Khi chuyển khoản, phụ huynh không cần sửa nội dung chuyển khoản.",
        "Sau khi chuyển khoản thành công, hệ thống sẽ tự cập nhật trạng thái thanh toán."
      ].join("\n"),
    [className, classShortCode, month, payUrl, year]
  );
  const [draft, setDraft] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);
  const outstandingAmount = rows
    .filter((row) => row.status === "unpaid")
    .reduce((sum, row) => sum + row.amount, 0);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard có thể bị trình duyệt chặn; nội dung vẫn có thể chép thủ công. */
    }
  }

  return (
    <Modal
      title={`Tổng quan ${className} · ${formatMonth(month, year)}`}
      onClose={onClose}
      maxWidthClassName="max-w-3xl"
    >
      <div className="grid gap-5">
        <div className="overflow-hidden rounded-xl border border-stone-200">
          <div className="max-h-80 overflow-auto">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="sticky top-0 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Học sinh</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Số buổi</th>
                  <th className="px-3 py-2.5 text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row, index) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <tr key={`${row.studentName}-${index}`}>
                      <td className="px-3 py-2.5 font-medium text-neutralText">{row.studentName}</td>
                      <td className="px-3 py-2.5"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td className="px-3 py-2.5 text-right">{row.sessions}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap justify-between gap-2 border-t border-stone-200 bg-stone-50 px-3 py-3 text-sm">
            <span>{rows.length} học sinh</span>
            <span>
              Còn phải thu: <strong className="text-warning">{formatCurrency(outstandingAmount)}</strong>
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="parent-link-message" className="text-sm font-semibold text-neutralText">
            Nội dung gửi phụ huynh
          </label>
          <p className="mt-1 text-xs text-stone-500">Có thể sửa nội dung trước khi chép sang Zalo.</p>
          <textarea
            id="parent-link-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={10}
            className="focus-ring mt-2 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm leading-relaxed shadow-sm hover:border-stone-400 focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Đóng</Button>
          <a href={payUrl} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="secondary">
              <ExternalLink className="h-4 w-4" />
              Mở trang nộp tiền
            </Button>
          </a>
          <Button type="button" onClick={copyMessage}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Đã chép" : "Chép tin nhắn"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
