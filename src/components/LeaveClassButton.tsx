"use client";

import { useState, useTransition } from "react";
import { UserMinus } from "lucide-react";
import { leaveClassAction } from "@/lib/actions/enrollments";
import { toast } from "@/components/Toaster";
import { Modal } from "@/components/Modal";
import { Button, Field, Textarea } from "@/components/ui";
import { formatMonth } from "@/lib/format";

/**
 * Cho học sinh nghỉ riêng lớp này (khác với lưu trữ cả hồ sơ). Chọn nghỉ ngay từ tháng
 * đang xem (hủy hóa đơn chưa đóng của tháng đó) hoặc từ tháng sau (vẫn thu tháng này).
 */
export function LeaveClassButton({
  enrollmentId,
  studentName,
  month,
  year,
  paidThisMonth,
  unpaidThisMonth,
  disabled = false
}: {
  enrollmentId: string;
  studentName: string;
  month: number;
  year: number;
  paidThisMonth: boolean;
  unpaidThisMonth: boolean;
  disabled?: boolean;
}) {
  const next = month === 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
  const [open, setOpen] = useState(false);
  const [fromThisMonth, setFromThisMonth] = useState(!paidThisMonth);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const from = fromThisMonth ? { month, year } : next;
    startTransition(async () => {
      try {
        const result = await leaveClassAction({
          enrollmentId,
          fromMonth: from.month,
          fromYear: from.year,
          reason
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        toast.success(result.success);
        setOpen(false);
      } catch {
        setError("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  const optionClass = (active: boolean, locked = false) =>
    [
      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-left text-sm transition-colors",
      locked ? "cursor-not-allowed opacity-50" : "",
      active ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200" : "border-stone-200 hover:border-indigo-300"
    ].join(" ");

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-8 w-8 shrink-0 px-0 text-stone-400 hover:bg-rose-50 hover:text-warning"
        disabled={disabled}
        title={disabled ? "Lưu hoặc hủy bản nháp trước" : `Cho ${studentName} nghỉ lớp này`}
        aria-label={`Cho ${studentName} nghỉ lớp này`}
        onClick={() => {
          setFromThisMonth(!paidThisMonth);
          setReason("");
          setError("");
          setOpen(true);
        }}
      >
        <UserMinus className="h-4 w-4" aria-hidden="true" />
      </Button>

      {open ? (
        <Modal title={`Cho ${studentName} nghỉ lớp`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <form onSubmit={submit} className="grid gap-4">
            <p className="text-sm text-stone-600">
              Chỉ nghỉ lớp này; các lớp khác của học sinh không đổi. Khoản nợ tháng cũ (nếu có) vẫn nằm ở trang Công nợ.
            </p>
            <div className="grid gap-2">
              <label className={optionClass(fromThisMonth, paidThisMonth)}>
                <input
                  type="radio"
                  name="from"
                  className="mt-1"
                  checked={fromThisMonth}
                  disabled={paidThisMonth || pending}
                  onChange={() => setFromThisMonth(true)}
                />
                <span>
                  <span className="block font-semibold">Nghỉ từ {formatMonth(month, year)}</span>
                  <span className="block text-xs text-stone-500">
                    {paidThisMonth
                      ? "Đã đóng học phí tháng này nên không chọn được; hoàn giao dịch trước nếu cần."
                      : unpaidThisMonth
                        ? "Không học tháng này. Hóa đơn chưa đóng của tháng này sẽ bị hủy."
                        : "Không học tháng này, không tạo hóa đơn."}
                  </span>
                </span>
              </label>
              <label className={optionClass(!fromThisMonth)}>
                <input
                  type="radio"
                  name="from"
                  className="mt-1"
                  checked={!fromThisMonth}
                  disabled={pending}
                  onChange={() => setFromThisMonth(false)}
                />
                <span>
                  <span className="block font-semibold">Nghỉ từ {formatMonth(next.month, next.year)}</span>
                  <span className="block text-xs text-stone-500">
                    Vẫn học và thu tiền {formatMonth(month, year)}; từ tháng sau không còn trong lớp.
                  </span>
                </span>
              </label>
            </div>
            <Field label="Lý do" hint="Không bắt buộc">
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={pending}
                placeholder="Ví dụ: chuyển trường, phụ huynh báo nghỉ..."
              />
            </Field>
            {error ? <p className="text-sm font-medium text-warning" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Đang lưu..." : "Xác nhận cho nghỉ"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}
