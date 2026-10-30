import { ExternalLink, FileText, Layers, Link2, PlayCircle, StickyNote } from "lucide-react";
import { clsx } from "clsx";
import { toneClass, type Tone } from "@/components/portal/kit";
import { formatDayMonth } from "@/lib/format";
import { materialHost } from "@/modules/learning";

type Material = { title: string; url: string | null; note: string; createdAt: Date };

/** Biểu tượng và màu theo nguồn tài liệu để học sinh nhận ra nhanh (video, Drive, Quizlet…). */
function sourceOf(url: string | null) {
  if (!url) return { label: "Ghi chú", icon: StickyNote, tone: "amber" as Tone };
  const host = materialHost(url);
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) return { label: "Video YouTube", icon: PlayCircle, tone: "rose" as Tone };
  if (/^(drive|docs)\.google\.com$/.test(host)) return { label: "Google Drive", icon: FileText, tone: "emerald" as Tone };
  if (/(^|\.)quizlet\.com$/.test(host)) return { label: "Quizlet", icon: Layers, tone: "indigo" as Tone };
  return { label: host, icon: Link2, tone: "sky" as Tone };
}

/** Một tài liệu dạng thẻ. Dùng chung cho cổng giáo viên và học sinh. */
export function MaterialCard({ material, actions }: { material: Material; actions?: React.ReactNode }) {
  const source = sourceOf(material.url);
  const tone = toneClass(source.tone);
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-stone-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start gap-3">
        <span className={clsx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", tone.soft, tone.text)}>
          <source.icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-semibold text-neutralText">{material.title}</p>
          <p className="truncate text-xs text-stone-500">
            {source.label} · {formatDayMonth(material.createdAt)}
          </p>
        </div>
        {actions ? <div className="flex shrink-0 gap-1">{actions}</div> : null}
      </div>
      {material.note ? <p className="line-clamp-4 whitespace-pre-line break-words text-sm text-stone-600">{material.note}</p> : null}
      {material.url ? (
        <a
          href={material.url}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring mt-auto inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-stone-50 text-sm font-semibold text-primary ring-1 ring-inset ring-stone-200 transition hover:bg-indigo-50 hover:ring-indigo-200"
        >
          <ExternalLink className="h-4 w-4" />
          Mở tài liệu
        </a>
      ) : null}
    </div>
  );
}
