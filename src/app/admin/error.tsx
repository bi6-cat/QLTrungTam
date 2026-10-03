"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button, Panel } from "@/components/ui";

// Bắt lỗi trong khu admin để không trắng cả trang: header và menu vẫn giữ nguyên,
// chỉ vùng nội dung hiện thông báo kèm nút thử lại.
export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel className="grid gap-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="grid gap-1">
          <h2 className="font-bold">Có lỗi xảy ra</h2>
          <p className="text-sm text-stone-600">
            Thao tác chưa hoàn tất hoặc trang chưa tải được. Dữ liệu đã lưu trước đó không bị ảnh hưởng.
          </p>
          {error.digest ? (
            <p className="text-xs text-stone-500">
              Mã lỗi: <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Thử lại
        </Button>
        <Button type="button" variant="secondary" onClick={() => window.location.reload()}>
          Tải lại trang
        </Button>
      </div>
    </Panel>
  );
}
