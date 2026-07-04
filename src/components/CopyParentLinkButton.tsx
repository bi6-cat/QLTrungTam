"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";

export function CopyParentLinkButton({
  className,
  classShortCode,
  payUrl
}: {
  className: string;
  classShortCode: string;
  payUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyMessage() {
    const message = [
      `Kính gửi Quý phụ huynh lớp ${className} (${classShortCode}),`,
      "",
      "Trung tâm APLUS ACADEMY gửi link tra cứu và thanh toán học phí:",
      payUrl,
      "",
      "Phụ huynh vui lòng chọn đúng tên học sinh, kiểm tra số tiền và quét mã QR hiển thị trên trang.",
      "Khi chuyển khoản, phụ huynh không cần sửa nội dung chuyển khoản.",
      "Sau khi chuyển khoản thành công, hệ thống sẽ tự cập nhật trạng thái thanh toán."
    ].join("\n");

    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button type="button" variant="secondary" onClick={copyMessage}>
      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
      {copied ? "Đã copy" : "Copy Zalo phụ huynh"}
    </Button>
  );
}
