"use client";

import { useActionState, useEffect, useState } from "react";
import { CalendarClock, Check, RotateCcw } from "lucide-react";
import { setClassSalaryCutoffAction } from "@/lib/actions/finance";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Modal } from "@/components/Modal";
import { Button, Field, Input } from "@/components/ui";

/**
 * Đổi ngày chốt lương của một lớp trong một tháng. HS nộp sau ngày chốt tự tính sang lương tháng
 * sau của lớp, nên đây là cách "chốt sớm/chốt muộn" riêng từng lớp mà không đụng các lớp khác.
 */
export function ClassSalaryCutoffButton({
  classId,
  className,
  month,
  year,
  value,
  min,
  max,
  classOverridden
}: {
  classId: string;
  className: string;
  month: number;
  year: number;
  /** Ngày chốt đang áp dụng, YYYY-MM-DD. */
  value: string;
  min: string;
  max: string;
  classOverridden: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="focus-ring inline-flex items-center gap-1 rounded-md px-1 text-xs font-semibold text-primary hover:bg-indigo-50"
        title={`Đổi ngày chốt lương T${month}/${year} của lớp ${className}`}
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        Đổi
      </button>
      {open ? (
        <CutoffDialog
          classId={classId}
          className={className}
          month={month}
          year={year}
          value={value}
          min={min}
          max={max}
          classOverridden={classOverridden}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function CutoffDialog({
  classId,
  className,
  month,
  year,
  value,
  min,
  max,
  classOverridden,
  onClose
}: {
  classId: string;
  className: string;
  month: number;
  year: number;
  value: string;
  min: string;
  max: string;
  classOverridden: boolean;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(setClassSalaryCutoffAction, EMPTY_RESULT_STATE);
  const [date, setDate] = useState(value);
  useResultToast(state);

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  return (
    <Modal title={`Ngày chốt lương T${month}/${year}`} onClose={() => !pending && onClose()} closeDisabled={pending}>
      <form action={action} className="grid gap-4">
        <input type="hidden" name="classId" value={classId} />
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="year" value={year} />
        <p className="text-sm text-stone-600">
          Chỉ áp dụng cho lớp <strong>{className}</strong>. Học phí nộp đến hết ngày chốt tính vào lương T{month}; nộp
          sau ngày này tự chuyển sang lương tháng sau.
        </p>
        <Field label="Ngày chốt" hint={`Trong tháng ${month} hoặc tháng kế tiếp`}>
          <Input
            type="date"
            name="cutoffDate"
            value={date}
            min={min}
            max={max}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </Field>
        {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          {classOverridden ? (
            <Button
              type="submit"
              variant="secondary"
              name="intent"
              value="reset"
              formNoValidate
              disabled={pending}
              className="mr-auto"
              title="Bỏ ngày đặt riêng, dùng lại ngày chốt chung"
            >
              <RotateCcw className="h-4 w-4" />
              Dùng ngày chung
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending || !date}>
            <Check className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
