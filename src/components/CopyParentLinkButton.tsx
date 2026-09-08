"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, ExternalLink, ListChecks, Loader2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge, Button } from "@/components/ui";
import { formatCurrency, formatMonth } from "@/lib/format";

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(draft);
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
      await document.fonts?.ready;

      const width = 1200;
      const sidePadding = 64;
      const headerHeight = 190;
      const tableHeaderHeight = 58;
      const rowHeight = 62;
      const summaryHeight = 72;
      const footerHeight = 70;
      const bodyRows = Math.max(rows.length, 1);
      const height = headerHeight + tableHeaderHeight + bodyRows * rowHeight + summaryHeight + footerHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Trình duyệt không hỗ trợ tạo ảnh.");

      const drawText = (
        value: string,
        x: number,
        y: number,
        maxWidth: number,
        align: CanvasTextAlign = "left"
      ) => {
        context.textAlign = align;
        if (context.measureText(value).width <= maxWidth) {
          context.fillText(value, x, y);
          return;
        }

        let shortened = value;
        while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
          shortened = shortened.slice(0, -1);
        }
        context.fillText(`${shortened}…`, x, y);
      };

      context.fillStyle = "#f5f5f4";
      context.fillRect(0, 0, width, height);
      context.fillStyle = "#3730a3";
      context.fillRect(0, 0, width, headerHeight);
      context.fillStyle = "#ffffff";
      context.font = "700 25px Arial, sans-serif";
      context.fillText("APLUS ACADEMY", sidePadding, 58);
      context.font = "700 38px Arial, sans-serif";
      drawText(className, sidePadding, 112, width - sidePadding * 2);
      context.fillStyle = "#e0e7ff";
      context.font = "500 22px Arial, sans-serif";
      context.fillText(`Tổng quan học phí · ${formatMonth(month, year)}`, sidePadding, 153);

      const tableLeft = sidePadding;
      const tableWidth = width - sidePadding * 2;
      const orderX = tableLeft + 24;
      const studentX = tableLeft + 90;
      const statusX = tableLeft + 445;
      const sessionsX = tableLeft + 720;
      const priceX = tableLeft + 900;
      const amountX = tableLeft + tableWidth - 24;

      context.fillStyle = "#e7e5e4";
      context.fillRect(tableLeft, headerHeight, tableWidth, tableHeaderHeight);
      context.fillStyle = "#57534e";
      context.font = "700 18px Arial, sans-serif";
      context.fillText("STT", orderX, headerHeight + 37);
      context.fillText("HỌC SINH", studentX, headerHeight + 37);
      context.fillText("TRẠNG THÁI", statusX, headerHeight + 37);
      context.textAlign = "right";
      context.fillText("SỐ BUỔI", sessionsX, headerHeight + 37);
      context.fillText("TIỀN / BUỔI", priceX, headerHeight + 37);
      context.fillText("SỐ TIỀN", amountX, headerHeight + 37);
      context.textAlign = "left";

      if (rows.length === 0) {
        context.fillStyle = "#ffffff";
        context.fillRect(tableLeft, headerHeight + tableHeaderHeight, tableWidth, rowHeight);
        context.fillStyle = "#78716c";
        context.font = "500 20px Arial, sans-serif";
        context.fillText("Chưa có học sinh trong tháng này", studentX, headerHeight + tableHeaderHeight + 39);
      } else {
        rows.forEach((row, index) => {
          const top = headerHeight + tableHeaderHeight + index * rowHeight;
          context.fillStyle = index % 2 === 0 ? "#ffffff" : "#fafaf9";
          context.fillRect(tableLeft, top, tableWidth, rowHeight);
          context.fillStyle = "#1c1917";
          context.font = "500 20px Arial, sans-serif";
          context.fillText(String(index + 1), orderX, top + 39);
          context.font = "600 21px Arial, sans-serif";
          drawText(row.studentName, studentX, top + 39, 310);

          const meta = STATUS_META[row.status];
          context.fillStyle = row.status === "paid" ? "#15803d" : row.status === "unpaid" ? "#c2410c" : "#57534e";
          context.font = "600 19px Arial, sans-serif";
          drawText(meta.label, statusX, top + 39, 250);
          context.fillStyle = "#292524";
          context.textAlign = "right";
          context.font = "500 20px Arial, sans-serif";
          context.fillText(String(row.sessions), sessionsX, top + 39);
          context.fillText(formatCurrency(row.pricePerSession), priceX, top + 39);
          context.font = "600 20px Arial, sans-serif";
          context.fillText(formatCurrency(row.amount), amountX, top + 39);
          context.textAlign = "left";
        });
      }

      const summaryTop = headerHeight + tableHeaderHeight + bodyRows * rowHeight;
      context.fillStyle = "#ffffff";
      context.fillRect(tableLeft, summaryTop, tableWidth, summaryHeight);
      context.strokeStyle = "#d6d3d1";
      context.beginPath();
      context.moveTo(tableLeft, summaryTop);
      context.lineTo(tableLeft + tableWidth, summaryTop);
      context.stroke();
      context.fillStyle = "#57534e";
      context.font = "600 21px Arial, sans-serif";
      context.fillText(`Tổng số: ${rows.length} học sinh`, studentX, summaryTop + 45);

      context.fillStyle = "#78716c";
      context.font = "400 17px Arial, sans-serif";
      context.fillText("Danh sách được xuất từ hệ thống quản lý APLUS ACADEMY.", sidePadding, height - 30);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Không thể tạo file ảnh.");
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
