"use client";

import { useState } from "react";
import { Check, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui";

export function CopyTeacherLinkButton({
  className,
  teacherUrl
}: {
  className: string;
  teacherUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const message = [
      `Link theo dõi lớp ${className} dành cho giáo viên:`,
      teacherUrl,
      "",
      "Thầy/cô có thể xem danh sách học sinh và tiến độ đóng học phí. Link chỉ dùng để xem, không sửa dữ liệu."
    ].join("\n");

    await navigator.clipboard.writeText(message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button type="button" variant="secondary" onClick={copyLink}>
      {copied ? <Check className="h-4 w-4 text-success" /> : <ClipboardList className="h-4 w-4" />}
      {copied ? "Đã copy" : "Link giáo viên"}
    </Button>
  );
}
