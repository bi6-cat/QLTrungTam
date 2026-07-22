"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Trash2,
  Upload
} from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge, Button, Input, Select, Textarea } from "@/components/ui";
import type {
  StudentImportCommitResult,
  StudentImportDraftRow,
  StudentImportField,
  StudentImportPreview,
  StudentImportPreviewRow
} from "@/lib/student-import-types";

type ErrorPayload = {
  error?: string;
  code?: string;
  preview?: StudentImportPreview;
};

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function draftRows(rows: StudentImportPreviewRow[]): StudentImportDraftRow[] {
  return rows.map(
    ({
      rowNumber,
      fullName,
      phone,
      parentName,
      address,
      classCodes,
      sessionsOverride,
      status,
      note
    }) => ({
      rowNumber,
      fullName,
      phone,
      parentName,
      address,
      classCodes,
      sessionsOverride,
      status,
      note
    })
  );
}

export function StudentExcelImportButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [sourceFileName, setSourceFileName] = useState("");
  const [rows, setRows] = useState<StudentImportPreviewRow[]>([]);
  const [validated, setValidated] = useState(false);
  const [warningsConfirmed, setWarningsConfirmed] = useState(false);
  const [pending, setPending] = useState<"preview" | "validate" | "commit" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<StudentImportCommitResult | null>(null);

  const counts = useMemo(() => {
    const issues = rows.flatMap((row) => row.issues);
    return {
      errors: issues.filter((issue) => issue.severity === "error").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      errorRows: rows.filter((row) => row.issues.some((issue) => issue.severity === "error"))
        .length,
      warningRows: rows.filter((row) =>
        row.issues.some((issue) => issue.severity === "warning")
      ).length
    };
  }, [rows]);

  function reset() {
    setFile(null);
    setSourceFileName("");
    setRows([]);
    setValidated(false);
    setWarningsConfirmed(false);
    setPending(null);
    setError("");
    setResult(null);
  }

  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function applyPreview(preview: StudentImportPreview) {
    setRows(preview.rows);
    setValidated(true);
    setWarningsConfirmed(false);
  }

  async function uploadAndPreview() {
    if (!file) {
      setError("Vui lòng chọn tệp Excel trước.");
      return;
    }
    setPending("preview");
    setError("");
    setResult(null);
    try {
      const data = new FormData();
      data.set("file", file);
      const response = await fetch("/api/admin/student-import/preview", {
        method: "POST",
        body: data
      });
      const payload = (await readJson(response)) as StudentImportPreview | ErrorPayload | null;
      if (!response.ok || !payload || !("rows" in payload)) {
        setError((payload as ErrorPayload | null)?.error || "Không thể đọc tệp Excel.");
        return;
      }
      setSourceFileName(file.name);
      applyPreview(payload);
    } catch {
      setError("Không thể kết nối máy chủ để đọc tệp.");
    } finally {
      setPending(null);
    }
  }

  function updateRow(index: number, field: StudentImportField, value: string) {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
    setValidated(false);
    setWarningsConfirmed(false);
    setError("");
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    setValidated(false);
    setWarningsConfirmed(false);
    setError("");
  }

  async function validateAgain() {
    if (rows.length === 0) {
      setError("Danh sách nhập đang trống.");
      return;
    }
    setPending("validate");
    setError("");
    try {
      const response = await fetch("/api/admin/student-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: draftRows(rows) })
      });
      const payload = (await readJson(response)) as StudentImportPreview | ErrorPayload | null;
      if (!response.ok || !payload || !("rows" in payload)) {
        setError((payload as ErrorPayload | null)?.error || "Không thể kiểm tra lại dữ liệu.");
        return;
      }
      applyPreview(payload);
    } catch {
      setError("Không thể kết nối máy chủ để kiểm tra dữ liệu.");
    } finally {
      setPending(null);
    }
  }

  async function commit() {
    if (!validated || counts.errors > 0 || rows.length === 0) return;
    if (counts.warnings > 0 && !warningsConfirmed) {
      setError("Hãy xác nhận đã đọc các cảnh báo trước khi lưu.");
      return;
    }
    setPending("commit");
    setError("");
    try {
      const response = await fetch("/api/admin/student-import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: draftRows(rows),
          confirmWarnings: warningsConfirmed,
          sourceFileName
        })
      });
      const payload = (await readJson(response)) as StudentImportCommitResult | ErrorPayload | null;
      if (!response.ok || !payload || !("ok" in payload)) {
        const failed = payload as ErrorPayload | null;
        if (failed?.preview) applyPreview(failed.preview);
        setError(failed?.error || "Không thể lưu dữ liệu nhập.");
        return;
      }
      setResult(payload);
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ để lưu dữ liệu.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="h-4 w-4" />
        Nhập Excel
      </Button>

      {open ? (
        <Modal title="Nhập học sinh và ghi danh từ Excel" onClose={close} maxWidthClassName="max-w-7xl">
          <div className="grid gap-4">
            {result ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                <div className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-5 w-5" />
                  Đã nhập dữ liệu thành công
                </div>
                <p className="mt-2">
                  Tạo {result.createdStudents} học sinh, dùng lại {result.reusedStudents} hồ sơ,
                  tạo {result.createdEnrollments} ghi danh
                  {result.skippedEnrollments > 0
                    ? ` và bỏ qua ${result.skippedEnrollments} ghi danh đã có.`
                    : "."}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" onClick={close}>Hoàn tất</Button>
                  <Button type="button" variant="secondary" onClick={reset}>Nhập tệp khác</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <label className="grid min-w-[260px] flex-1 gap-1.5 text-sm font-medium text-stone-700">
                    Chọn tệp Excel
                    <Input
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={(event) => {
                        setFile(event.target.files?.[0] ?? null);
                        setSourceFileName("");
                        setRows([]);
                        setValidated(false);
                        setWarningsConfirmed(false);
                        setResult(null);
                        setError("");
                      }}
                    />
                  </label>
                  <Button type="button" onClick={uploadAndPreview} disabled={!file || Boolean(pending)}>
                    <Upload className="h-4 w-4" />
                    {pending === "preview" ? "Đang đọc..." : "Xem trước"}
                  </Button>
                  <a
                    href="/api/admin/student-import/template"
                    className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-stone-50"
                  >
                    <Download className="h-4 w-4" />
                    Tải tệp mẫu
                  </a>
                  <p className="w-full text-xs text-stone-500">
                    Tối đa 500 dòng, 5 MB. Có thể ghi nhiều mã lớp trên một dòng, cách nhau bằng dấu phẩy.
                    Tệp .xls kiểu cũ cần được lưu lại thành .xlsx.
                  </p>
                </div>

                {error ? (
                  <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </div>
                ) : null}

                {rows.length > 0 ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2 text-sm">
                        <Badge tone="primary">{rows.length} dòng</Badge>
                        <Badge tone={counts.errors ? "warning" : "success"}>
                          {counts.errors} lỗi / {counts.errorRows} dòng
                        </Badge>
                        <Badge tone={counts.warnings ? "warning" : "success"}>
                          {counts.warnings} cảnh báo / {counts.warningRows} dòng
                        </Badge>
                        {!validated ? <Badge tone="warning">Đã sửa — cần kiểm tra lại</Badge> : null}
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={validateAgain}
                        disabled={Boolean(pending)}
                      >
                        <RefreshCw className={`h-4 w-4 ${pending === "validate" ? "animate-spin" : ""}`} />
                        {pending === "validate" ? "Đang kiểm tra..." : "Kiểm tra lại"}
                      </Button>
                    </div>

                    <div className="max-h-[52vh] overflow-auto rounded-xl border border-stone-200">
                      <table className="min-w-[1680px] w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-stone-100 text-stone-600 shadow-sm">
                          <tr>
                            <th className="px-2 py-2">Dòng</th>
                            <th className="min-w-52 px-2 py-2">Họ và tên*</th>
                            <th className="min-w-36 px-2 py-2">Số điện thoại*</th>
                            <th className="min-w-48 px-2 py-2">Phụ huynh</th>
                            <th className="min-w-64 px-2 py-2">Địa chỉ</th>
                            <th className="min-w-52 px-2 py-2">Mã lớp*</th>
                            <th className="min-w-28 px-2 py-2">Số buổi</th>
                            <th className="min-w-36 px-2 py-2">Trạng thái</th>
                            <th className="min-w-64 px-2 py-2">Ghi chú</th>
                            <th className="w-12 px-2 py-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200">
                          {rows.map((row, index) => {
                            const hasError = row.issues.some((issue) => issue.severity === "error");
                            const hasWarning = row.issues.some((issue) => issue.severity === "warning");
                            return (
                              <tr
                                key={`${row.rowNumber}-${index}`}
                                className={hasError ? "bg-rose-50/60" : hasWarning ? "bg-amber-50/50" : "bg-white"}
                              >
                                <td className="px-2 py-2 align-top font-mono text-stone-500">{row.rowNumber}</td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.fullName}
                                    onChange={(event) => updateRow(index, "fullName", event.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.phone}
                                    inputMode="tel"
                                    onChange={(event) => updateRow(index, "phone", event.target.value)}
                                    className="h-9 font-mono text-xs"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.parentName}
                                    onChange={(event) => updateRow(index, "parentName", event.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.address}
                                    onChange={(event) => updateRow(index, "address", event.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.classCodes}
                                    onChange={(event) => updateRow(index, "classCodes", event.target.value)}
                                    placeholder="TOAN6, VAN6"
                                    className="h-9 font-mono text-xs uppercase"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Input
                                    value={row.sessionsOverride}
                                    type="number"
                                    min={0}
                                    max={60}
                                    onChange={(event) => updateRow(index, "sessionsOverride", event.target.value)}
                                    className="h-9 text-xs"
                                  />
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Select
                                    value={row.status}
                                    onChange={(event) => updateRow(index, "status", event.target.value)}
                                    className="h-9 text-xs"
                                  >
                                    {row.status !== "active" && row.status !== "on_leave" ? (
                                      <option value={row.status}>Không hợp lệ</option>
                                    ) : null}
                                    <option value="active">Đang học</option>
                                    <option value="on_leave">Bảo lưu</option>
                                  </Select>
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Textarea
                                    value={row.note}
                                    onChange={(event) => updateRow(index, "note", event.target.value)}
                                    className="min-h-9 h-9 resize-y py-2 text-xs"
                                  />
                                  {row.issues.length > 0 ? (
                                    <div className="mt-2 grid gap-1">
                                      {row.issues.map((issue, issueIndex) => (
                                        <p
                                          key={`${issue.code}-${issueIndex}`}
                                          className={issue.severity === "error" ? "text-rose-700" : "text-amber-700"}
                                        >
                                          {issue.severity === "error" ? "Lỗi:" : "Cảnh báo:"} {issue.message}
                                        </p>
                                      ))}
                                    </div>
                                  ) : null}
                                </td>
                                <td className="px-2 py-2 align-top">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    className="h-9 w-9 px-0 text-rose-600"
                                    onClick={() => removeRow(index)}
                                    title={`Bỏ dòng ${row.rowNumber}`}
                                    aria-label={`Bỏ dòng ${row.rowNumber}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {validated && counts.warnings > 0 && counts.errors === 0 ? (
                      <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-amber-400"
                          checked={warningsConfirmed}
                          onChange={(event) => setWarningsConfirmed(event.target.checked)}
                        />
                        <span>
                          <strong>Tôi đã đọc {counts.warnings} cảnh báo</strong> và xác nhận các trường hợp dùng chung số điện thoại hoặc hồ sơ có sẵn là đúng.
                        </span>
                      </label>
                    ) : null}

                    {validated && counts.errors > 0 ? (
                      <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        Còn lỗi nên chưa thể lưu. Sửa hoặc bỏ các dòng lỗi rồi bấm Kiểm tra lại.
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-200 pt-4">
                      <Button type="button" variant="secondary" onClick={close} disabled={Boolean(pending)}>
                        Hủy
                      </Button>
                      <Button
                        type="button"
                        onClick={commit}
                        disabled={
                          Boolean(pending) ||
                          !validated ||
                          rows.length === 0 ||
                          counts.errors > 0 ||
                          (counts.warnings > 0 && !warningsConfirmed)
                        }
                      >
                        <FileSpreadsheet className="h-4 w-4" />
                        {pending === "commit" ? "Đang lưu..." : `Lưu ${rows.length} dòng`}
                      </Button>
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
