"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, ListChecks, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";
import { toast } from "@/components/Toaster";
import { buildParentNotice } from "@/lib/parent-notice";
import { renderTuitionOverviewImage } from "@/lib/tuition-overview-image";

type OverviewStatus = "unpaid" | "paid" | "waived" | "void" | "not_created" | "on_leave";

type OverviewRow = {
  studentName: string;
  status: OverviewStatus;
  sessions: number;
  pricePerSession: number;
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
  rows,
  adjustmentNote = ""
}: {
  className: string;
  classShortCode: string;
  payUrl: string;
  month: number;
  year: number;
  rows: OverviewRow[];
  /** Lý do trừ/cộng buổi của lớp theo thời khóa biểu, vd "đã trừ 1 buổi lớp nghỉ T10: 15/10 (GV ốm)". */
  adjustmentNote?: string;
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
          adjustmentNote={adjustmentNote}
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
  adjustmentNote,
  onClose
}: {
  className: string;
  classShortCode: string;
  payUrl: string;
  month: number;
  year: number;
  rows: OverviewRow[];
  adjustmentNote: string;
  onClose: () => void;
}) {
  const defaultMessage = useMemo(
    () => buildParentNotice({ className, payUrl, month, year, rows, adjustmentNote }),
    [adjustmentNote, className, month, payUrl, rows, year]
  );
  const [draft, setDraft] = useState(defaultMessage);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(draft);
      toast.success("Đã chép tin nhắn kèm link nộp học phí.");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* Clipboard có thể bị trình duyệt chặn; nội dung vẫn có thể chép thủ công. */
    }
  }

  async function downloadOverviewImage() {
    setExporting(true);
    setExportError("");

    try {
      const blob = await renderTuitionOverviewImage({ centerName: "APLUS ACADEMY", logoSrc: "/logo.jpg", className, month, year, rows });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `hoc-phi-${classShortCode}-${year}-${String(month).padStart(2, "0")}.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Không thể tải ảnh danh sách.");
    } finally {
      setExporting(false);
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
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 bg-stone-50 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="w-14 px-3 py-2.5 text-center">STT</th>
                  <th className="px-3 py-2.5">Học sinh</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Số buổi</th>
                  <th className="px-3 py-2.5 text-right">Số tiền / buổi</th>
                  <th className="px-3 py-2.5 text-right">Số tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {rows.map((row, index) => {
                  const meta = STATUS_META[row.status];
                  return (
                    <tr key={`${row.studentName}-${index}`}>
                      <td className="px-3 py-2.5 text-center text-stone-500">{index + 1}</td>
                      <td className="px-3 py-2.5 font-medium text-neutralText">{row.studentName}</td>
                      <td className="px-3 py-2.5"><Badge tone={meta.tone}>{meta.label}</Badge></td>
                      <td className="px-3 py-2.5 text-right">{row.sessions}</td>
                      <td className="px-3 py-2.5 text-right">{formatCurrency(row.pricePerSession)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold">{formatCurrency(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-stone-200 bg-stone-50 px-3 py-3 text-sm">
            Tổng số: <strong>{rows.length} học sinh</strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>Ảnh có thông tin học phí cả lớp, chỉ nên gửi đúng nhóm phụ huynh của lớp.</span>
          <Button type="button" variant="secondary" onClick={downloadOverviewImage} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? "Đang tạo ảnh..." : "Tải ảnh danh sách"}
          </Button>
        </div>
        {exportError ? <p className="text-sm font-medium text-warning">{exportError}</p> : null}

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
