"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { createEnrollmentAction } from "@/lib/actions";
import { Button, Field, Input, Select } from "@/components/ui";

type StudentOption = {
  id: string;
  fullName: string;
  phone: string;
};

const PAGE_SIZE = 6;

export function StudentEnrollmentPicker({
  classId,
  students
}: {
  classId: string;
  students: StudentOption[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(students[0]?.id ?? "");

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
  const selected = students.find((student) => student.id === selectedId);

  return (
    <form action={createEnrollmentAction} className="mt-4 grid gap-4">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="studentId" value={selectedId} />

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

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((student) => {
          const isSelected = student.id === selectedId;
          return (
            <button
              key={student.id}
              type="button"
              onClick={() => setSelectedId(student.id)}
              className={[
                "rounded-md border p-3 text-left transition",
                isSelected
                  ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                  : "border-stone-200 bg-white hover:border-indigo-200"
              ].join(" ")}
            >
              <div className="truncate font-semibold">{student.fullName}</div>
              <div className="text-xs text-stone-500">{student.phone}</div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-stone-300 p-4 text-center text-sm text-stone-600">
          Không tìm thấy học sinh phù hợp.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-stone-600">
          Đã chọn: <strong className="text-neutralText">{selected?.fullName ?? "Chưa chọn"}</strong>
        </div>
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
        <Button type="submit" className="self-end" disabled={!selectedId}>
          <Plus className="h-4 w-4" />
          Thêm vào lớp
        </Button>
      </div>
    </form>
  );
}
