"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCheck, Plus } from "lucide-react";
import { createExpenseAction, settleTeacherSalaryAction } from "@/lib/actions/finance";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { useResultToast } from "@/components/Toaster";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/schedule";
import { formatCurrency } from "@/lib/format";

/**
 * Chốt lương một giáo viên trong kỳ: ghi phần chênh lệch (lương lần đầu, bổ sung thu muộn
 * hoặc điều chỉnh giảm) của các lớp của người đó thành chi phí của chính kỳ này.
 */
export function SettleSalaryButton({
  month,
  year,
  teacherName,
  classIds,
  difference
}: {
  month: number;
  year: number;
  teacherName: string;
  classIds: string[];
  difference: number;
}) {
  const [state, action, pending] = useActionState(settleTeacherSalaryAction, EMPTY_RESULT_STATE);
  useResultToast(state, { showError: true });

  return (
    <form action={action}>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      {classIds.map((classId) => (
        <input key={classId} type="hidden" name="classId" value={classId} />
      ))}
      <Button
        type="submit"
        variant={difference < 0 ? "secondary" : "accent"}
        className="h-9 whitespace-nowrap px-3 text-xs"
        disabled={pending}
        title={`Ghi ${difference < 0 ? "điều chỉnh giảm" : "lương"} ${formatCurrency(Math.abs(difference))} cho ${teacherName || "giáo viên"} vào chi phí tháng ${month}/${year}`}
      >
        <CheckCheck className="h-4 w-4" />
        {pending ? "Đang chốt..." : difference < 0 ? `Chốt giảm ${formatCurrency(-difference)}` : `Chốt ${formatCurrency(difference)}`}
      </Button>
    </form>
  );
}

export function AddExpenseForm({
  month,
  year,
  classes
}: {
  month: number;
  year: number;
  classes: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(createExpenseAction, EMPTY_RESULT_STATE);
  const [category, setCategory] = useState("other");
  const formRef = useRef<HTMLFormElement>(null);
  const isSalary = category === "teacher_salary";
  useResultToast(state);

  // Thêm xong thì dọn form để nhập tiếp khoản khác.
  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    setCategory("other");
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3 lg:grid-cols-6">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      <div className="lg:col-span-2">
        <Field label="Nội dung">
          <Input name="description" required placeholder="Tiền điện tháng này" />
        </Field>
      </div>
      <Field label="Loại chi phí">
        <Select name="category" value={category} onChange={(event) => setCategory(event.target.value)}>
          {EXPENSE_CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Số tiền">
        <Input name="amount" type="number" min="1" required inputMode="numeric" />
      </Field>
      <div className="lg:col-span-2">
        {isSalary ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Lương theo lớp được tính tự động ở bảng <strong>Lương giáo viên</strong> phía trên. Ở đây chỉ nhập
            khoản lương chung không gắn lớp (vd lương cố định).
          </p>
        ) : (
          <Field label="Gắn với lớp" hint="Không bắt buộc">
            <Select name="classId" defaultValue="">
              <option value="">Chi phí chung</option>
              {classes.map((classRoom) => (
                <option key={classRoom.id} value={classRoom.id}>
                  {classRoom.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="lg:col-span-6">
        <Field label="Ghi chú">
          <Textarea name="note" className="min-h-16" />
        </Field>
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700 lg:col-span-6">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}

      <div className="lg:col-span-6">
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          {pending ? "Đang lưu..." : "Thêm chi phí"}
        </Button>
      </div>
    </form>
  );
}
