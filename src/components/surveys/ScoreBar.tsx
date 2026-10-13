import { clsx } from "clsx";
import { formatScore } from "@/lib/survey-core";

/** Màu theo điểm sao: từ 4 là tốt, dưới 3 cần xử lý. */
export function scoreTone(score: number | null) {
  if (score === null) return { bar: "bg-stone-300", text: "text-stone-500" };
  if (score >= 4) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (score >= 3) return { bar: "bg-amber-400", text: "text-amber-700" };
  return { bar: "bg-rose-500", text: "text-rose-700" };
}

/** Một hàng nhãn + thanh điểm trên thang 5 + số điểm. */
export function ScoreBar({
  label,
  score,
  hint,
  muted = false
}: {
  label: React.ReactNode;
  score: number | null;
  hint?: React.ReactNode;
  /** Chưa đủ phiếu: hiện nhãn nhưng không hiện điểm. */
  muted?: boolean;
}) {
  const tone = scoreTone(muted ? null : score);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5">
      <p className="min-w-0 truncate text-sm font-medium text-neutralText">{label}</p>
      <p className={clsx("text-sm font-bold tabular-nums", tone.text)}>{muted ? "—" : `${formatScore(score)}/5`}</p>
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-stone-100">
        {!muted && score !== null ? (
          <div className={clsx("h-full rounded-full", tone.bar)} style={{ width: `${(score / 5) * 100}%` }} />
        ) : null}
      </div>
      {hint ? <p className="col-span-2 text-xs text-stone-500">{hint}</p> : null}
    </div>
  );
}

/** Thanh phân bố đếm (số phiếu cho từng mức / lựa chọn), độ dài theo tỉ lệ với tổng. */
export function CountBar({ label, count, total }: { label: React.ReactNode; count: number; total: number }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4.5rem]">
      <span className="truncate text-stone-600">{label}</span>
      <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-right tabular-nums text-stone-600">
        {count} <span className="text-xs text-stone-400">({percent}%)</span>
      </span>
    </div>
  );
}
