import { ExternalLink } from "lucide-react";
import { formatDayMonth } from "@/lib/format";
import { materialHost } from "@/modules/learning";

type Material = { title: string; url: string | null; note: string; createdAt: Date };

/** Một tài liệu: tên, nút mở đường dẫn, ghi chú. Dùng chung cho cổng giáo viên và học sinh. */
export function MaterialCard({ material, actions }: { material: Material; actions?: React.ReactNode }) {
  return (
    <div className="grid gap-2 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutralText">{material.title}</p>
          <p className="text-xs text-stone-500">Đăng {formatDayMonth(material.createdAt)}</p>
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
      {material.note ? <p className="whitespace-pre-line break-words text-sm text-stone-700">{material.note}</p> : null}
      {material.url ? (
        <a
          href={material.url}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring inline-flex w-fit max-w-full items-center gap-1.5 rounded-lg text-sm font-semibold text-primary hover:underline"
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          <span className="truncate">Mở tài liệu · {materialHost(material.url)}</span>
        </a>
      ) : null}
    </div>
  );
}
