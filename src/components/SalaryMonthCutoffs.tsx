"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarClock, Check, RotateCcw } from "lucide-react";
import { setSalaryMonthCutoffAction } from "@/lib/actions/finance";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Badge, Button, Input } from "@/components/ui";

export type MonthCutoffRow = {
  month: number;
  year: number;
  /** Ngày chốt đang áp dụng, dạng YYYY-MM-DD. */
  value: string;
  /** Ngày theo quy tắc chung, dạng dd/mm. */
  defaultLabel: string;
  overridden: boolean;
  /** Giới hạn chọn ngày: trong tháng đó hoặc tháng kế tiếp. */
  min: string;
  max: string;
};

/** Bảng ngày chốt từng tháng: xem nhanh, đặt riêng tháng trả lương khác ngày, hoặc bỏ đặt riêng. */
export function SalaryMonthCutoffs({ rows, ruleLabel }: { rows: MonthCutoffRow[]; ruleLabel: string }) {
  return (
    <details className="group rounded-2xl border border-stone-200/80 bg-white shadow-soft">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-4">
        <span className="flex items-center gap-2 font-bold">
          <CalendarClock className="h-5 w-5 text-primary" />
          Ngày chốt lương từng tháng
        </span>
        <span className="text-xs text-stone-500">
          Mặc định: {ruleLabel} ·{" "}
          {rows.filter((row) => row.overridden).length > 0
            ? `${rows.filter((row) => row.overridden).length} tháng đặt riêng`
            : "chưa có tháng đặt riêng"}{" "}
          <span className="font-semibold text-primary group-open:hidden">· Xem/sửa</span>
        </span>
      </summary>
      <div className="grid gap-2 border-t border-stone-100 p-4">
        <p className="text-xs text-stone-500">
          Tháng nào trả lương khác ngày thường lệ thì đặt riêng ngày chốt cho tháng đó (áp dụng cho các lớp theo
          ngày chốt chung). Học phí nộp sau ngày chốt tính sang lương tháng sau.
        </p>
        {rows.map((row) => (
          <CutoffRow key={`${row.year}-${row.month}`} row={row} />
        ))}
      </div>
    </details>
  );
}

function CutoffRow({ row }: { row: MonthCutoffRow }) {
  const [state, action, pending] = useActionState(setSalaryMonthCutoffAction, EMPTY_RESULT_STATE);
  const [value, setValue] = useState(row.value);
  useResultToast(state, { showError: true });

  // Sau khi lưu, server trả ngày mới qua props: đồng bộ lại ô nhập.
  useEffect(() => setValue(row.value), [row.value]);

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-100 px-3 py-2 text-sm"
    >
      <input type="hidden" name="month" value={row.month} />
      <input type="hidden" name="year" value={row.year} />
      <span className="w-28 font-semibold">
        Lương T{row.month}/{row.year}
      </span>
      <Input
        type="date"
        name="cutoffDate"
        value={value}
        min={row.min}
        max={row.max}
        onChange={(event) => setValue(event.target.value)}
        className="h-9 w-40"
        required
      />
      {row.overridden ? (
        <Badge tone="primary">Đặt riêng · mặc định {row.defaultLabel}</Badge>
      ) : (
        <Badge tone="neutral">Theo mặc định</Badge>
      )}
      <div className="ml-auto flex gap-1.5">
        {value !== row.value ? (
          <Button type="submit" className="h-9 px-3 text-xs" disabled={pending}>
            <Check className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        ) : null}
        {row.overridden ? (
          <Button
            type="submit"
            variant="secondary"
            className="h-9 px-3 text-xs"
            disabled={pending}
            formNoValidate
            name="intent"
            value="reset"
            title="Bỏ đặt riêng, dùng ngày chốt chung"
          >
            <RotateCcw className="h-4 w-4" />
            Dùng mặc định
          </Button>
        ) : null}
      </div>
    </form>
  );
}
