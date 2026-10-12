import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { pageItems } from "@/lib/pagination";

// Phân trang dùng chung cho mọi tab. Không có "use client": trang server truyền hrefFor (Link),
// component client truyền onChange (nút bấm).

type PaginationProps = {
  page: number;
  totalPages: number;
  /** Tổng số dòng + đơn vị để hiện "21–40 / 57 học sinh"; bỏ trống thì chỉ hiện nút. */
  total?: number;
  pageSize?: number;
  itemLabel?: string;
  hrefFor?: (page: number) => string;
  onChange?: (page: number) => void;
  disabled?: boolean;
  /** Ẩn cả thanh khi chỉ có 1 trang (mặc định vẫn hiện dòng tổng nếu có total). */
  hideWhenSingle?: boolean;
  /** false: giữ vị trí cuộn khi chuyển trang (trang có nhiều danh sách). */
  scroll?: boolean;
  className?: string;
};

const baseButton =
  "focus-ring inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border px-2.5 text-sm font-semibold transition-colors";
const idleButton = "border-stone-300 bg-white text-neutralText hover:border-indigo-300 hover:bg-indigo-50 hover:text-primary";
const activeButton = "border-primary bg-primary text-white shadow-sm";
const disabledButton = "pointer-events-none border-stone-200 bg-stone-50 text-stone-300";

function PageControl({
  target,
  current,
  disabled,
  hrefFor,
  onChange,
  scroll,
  label,
  children
}: {
  target: number;
  current?: boolean;
  disabled?: boolean;
  hrefFor?: (page: number) => string;
  onChange?: (page: number) => void;
  scroll?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className = `${baseButton} ${disabled ? disabledButton : current ? activeButton : idleButton}`;
  if (hrefFor) {
    // Trang server: không được gắn onClick, nên trang hiện tại / nút khóa là <span>.
    return disabled || current ? (
      <span className={className} aria-label={label} aria-current={current ? "page" : undefined} aria-disabled={disabled || undefined}>
        {children}
      </span>
    ) : (
      <Link href={hrefFor(target)} className={className} aria-label={label} scroll={scroll}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled || current}
      onClick={() => onChange?.(target)}
    >
      {children}
    </button>
  );
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  itemLabel = "dòng",
  hrefFor,
  onChange,
  disabled = false,
  hideWhenSingle = false,
  scroll,
  className = ""
}: PaginationProps) {
  const pages = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), pages);
  if (pages <= 1 && (hideWhenSingle || total === undefined)) return null;

  const summary =
    total !== undefined && pageSize
      ? total === 0
        ? `0 ${itemLabel}`
        : `${(current - 1) * pageSize + 1}–${Math.min(current * pageSize, total)} / ${total} ${itemLabel}`
      : null;

  return (
    <nav
      aria-label="Phân trang"
      className={twMerge("flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 px-4 py-3", className)}
    >
      {summary ? <p className="text-sm text-stone-600">{summary}</p> : <span />}
      {pages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <PageControl target={current - 1} disabled={disabled || current <= 1} hrefFor={hrefFor} onChange={onChange} scroll={scroll} label="Trang trước">
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Trước</span>
          </PageControl>
          {pageItems(current, pages).map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1 text-sm text-stone-400">
                …
              </span>
            ) : (
              <PageControl
                key={item}
                target={item}
                current={item === current}
                disabled={disabled}
                hrefFor={hrefFor}
                onChange={onChange}
                scroll={scroll}
                label={`Trang ${item}`}
              >
                {item}
              </PageControl>
            )
          )}
          <PageControl target={current + 1} disabled={disabled || current >= pages} hrefFor={hrefFor} onChange={onChange} scroll={scroll} label="Trang sau">
            <span className="hidden sm:inline">Sau</span>
            <ChevronRight className="h-4 w-4" />
          </PageControl>
        </div>
      ) : null}
    </nav>
  );
}
