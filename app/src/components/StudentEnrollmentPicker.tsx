"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { createEnrollmentAction } from "@/lib/actions";
import { Button, Field, Input, Select } from "@/components/ui";

type StudentOption = {
  id: string;
  fullName: string;
  phone: string;
};

const PAGE_SIZE = 12;

export function StudentEnrollmentPicker({
  classId,
  students,
  onSuccess
}: {
  classId: string;
  students: StudentOption[];
  onSuccess?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit(formData: FormData) {
    if (selectedIds.size === 0) return;
    setPending(true);
    try {
      const sessionsOverride = formData.get("sessionsOverride");
      const status = formData.get("status");
      await Promise.all(
        [...selectedIds].map((studentId) => {
          const data = new FormData();
          data.set("classId", classId);
          data.set("studentId", studentId);
          if (sessionsOverride) data.set("sessionsOverride", sessionsOverride);
          if (status) data.set("status", status);
          return createEnrollmentAction(data);
        })
      );
      onSuccess?.();
    } finally {
      setPending(false);
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return students;
    return students.filter((student) =>
      `${student.fullName} ${student.phone}`.toLowerCase().includes(normalized)
    );
  }, [query, students]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <form action={handleSubmit} className="mt-4 grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium text-stone-700">
        Tìm học sinh
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Nhập tên hoặc số điện thoại"
            className="pl-9"
          />
        </div>
      </label>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((student) => {
          const isSelected = selectedIds.has(student.id);
          return (
            <button
              key={student.id}
              type="button"
              onClick={() => toggleSelected(student.id)}
              className={[
                "focus-ring relative rounded-xl border p-3 text-left transition-all duration-150",
                isSelected
                  ? "border-indigo-300 bg-indigo-50 shadow-sm ring-1 ring-indigo-200"
                  : "border-stone-200 bg-white hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-sm"
              ].join(" ")}
            >
              {isSelected ? (
                <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-white">
                  <Check className="h-3.5 w-3.5" />
                </span>
              ) : null}
              <div className="truncate pr-6 font-semibold">{student.fullName}</div>
              <div className="text-xs text-stone-500">{student.phone}</div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-4 text-center text-sm text-stone-600">
          {students.length === 0 ? "Tất cả học sinh đã có trong lớp này." : "Không tìm thấy học sinh phù hợp."}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-stone-600">
          Đã chọn: <strong className="text-neutralText">{selectedIds.size} học sinh</strong>
        </div>
        {totalPages > 1 ? (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold text-stone-600">
              {currentPage}/{totalPages}
            </span>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-[160px_160px_auto]">
        <Field label="Buổi riêng">
          <Input name="sessionsOverride" type="number" min="1" placeholder="Trống" />
        </Field>
        <Field label="Trạng thái">
          <Select name="status" defaultValue="active">
            <option value="active">Đang học</option>
            <option value="on_leave">Bảo lưu</option>
          </Select>
        </Field>
        <Button type="submit" className="self-end" disabled={selectedIds.size === 0 || pending}>
          <Plus className="h-4 w-4" />
          {pending
            ? "Đang thêm..."
            : selectedIds.size > 1
              ? `Thêm ${selectedIds.size} học sinh vào lớp`
              : "Thêm vào lớp"}
        </Button>
      </div>
    </form>
  );
}
