"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Plus, Wand2 } from "lucide-react";
import { createExpenseAction, generateTeacherSalaryAction } from "@/lib/actions";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { EXPENSE_CATEGORIES } from "@/lib/schedule";

function Alert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const isError = tone === "error";
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border p-3 text-sm font-medium ${
        isError
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-emerald-200 bg-emerald-50 text-emerald-700"
      }`}
    >
      {isError ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{children}</span>
    </div>
  );
}

export function GenerateSalaryButton({ month, year }: { month: number; year: number }) {
  const [state, action, pending] = useActionState(generateTeacherSalaryAction, {
    error: "",
    success: ""
  });

  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      <Button type="submit" variant="accent" disabled={pending}>
        <Wand2 className="h-4 w-4" />
        {pending ? "Đang tính..." : `Tính lương giáo viên tháng ${month}/${year}`}
      </Button>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
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
  const [state, action, pending] = useActionState(createExpenseAction, { error: "", ok: false });

  return (
    <form action={action} className="grid gap-3 lg:grid-cols-6">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="year" value={year} />
      <div className="lg:col-span-2">
        <Field label="Nội dung">
          <Input name="description" required placeholder="Tiền điện tháng này" />
        </Field>
      </div>
      <Field label="Loại chi phí">
        <Select name="category" defaultValue="other">
          {EXPENSE_CATEGORIES.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Số tiền">
        <Input name="amount" type="number" min="1" required inputMode="numeric" />
      </Field>
      <div className="lg:col-span-2">
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
      </div>
      <div className="lg:col-span-6">
        <Field label="Ghi chú">
          <Textarea name="note" className="min-h-16" />
        </Field>
      </div>

      {state.error ? (
        <div className="lg:col-span-6">
          <Alert tone="error">{state.error}</Alert>
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
