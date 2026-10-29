"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, KeyRound, LockOpen, RefreshCw } from "lucide-react";
import { resetStudentPinAction, unlockStudentAction, type ResetPinState } from "@/app/admin/accounts/actions";
import { Modal } from "@/components/Modal";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Badge, Button, Panel } from "@/components/ui";

type StudentRow = { id: string; fullName: string; onLeave: boolean; code: string | null; locked: boolean };

const smallButton = "h-8 gap-1 rounded-lg px-2 text-xs text-stone-600 hover:bg-indigo-50 hover:text-primary";

export function StudentAccounts({
  classRoom,
  students
}: {
  classRoom: { id: string; name: string; shortCode: string };
  students: StudentRow[];
}) {
  const missing = students.filter((s) => !s.code).length;
  const [confirmAll, setConfirmAll] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();

  async function download(mode: "missing" | "all") {
    setDownloading(true);
    try {
      const body = new FormData();
      body.set("classId", classRoom.id);
      body.set("mode", mode);
      const response = await fetch("/api/admin/student-accounts", { method: "POST", body });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        toast.error(data?.error ?? "Không cấp được tài khoản. Vui lòng tải lại trang và thử lại.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `tai-khoan-${classRoom.shortCode}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Đã cấp cho ${response.headers.get("X-Issued-Count") ?? ""} em. File phiếu in đã tải về.`);
      setConfirmAll(false);
      router.refresh();
    } catch {
      toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-neutralText">{classRoom.name}</h2>
          <p className="text-sm text-stone-600">
            {students.length - missing}/{students.length} em đã có tài khoản.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={downloading || missing === 0} onClick={() => download("missing")}>
            <Download className="h-4 w-4" />
            {missing > 0 ? `Cấp cho ${missing} em chưa có` : "Cả lớp đã có tài khoản"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={downloading || students.length === missing}
            onClick={() => setConfirmAll(true)}
          >
            <RefreshCw className="h-4 w-4" />
            Cấp lại PIN cả lớp
          </Button>
        </div>
      </div>
      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Mã PIN chỉ có trong file Excel tải về lúc cấp, hệ thống không lưu lại được. Mất phiếu thì cấp PIN mới cho em đó (mã học sinh giữ
        nguyên).
      </p>

      {students.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">Lớp chưa có học sinh nào đang học.</p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100 rounded-xl border border-stone-200">
          {students.map((student) => (
            <li key={student.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-neutralText">
                  {student.fullName}
                  {student.onLeave ? <Badge tone="neutral">Bảo lưu</Badge> : null}
                  {student.locked ? <Badge tone="warning">Đang khoá vì nhập sai</Badge> : null}
                </p>
                <p className="text-xs text-stone-500">
                  {student.code ? (
                    <>
                      Mã: <span className="font-mono font-semibold tracking-wider text-stone-700">{student.code}</span>
                    </>
                  ) : (
                    "Chưa cấp tài khoản"
                  )}
                </p>
              </div>
              {student.code ? (
                <div className="flex items-center gap-1">
                  {student.locked ? <UnlockButton studentId={student.id} /> : null}
                  <ResetPinButton student={student} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {confirmAll ? (
        <Modal title={`Cấp lại PIN cả lớp ${classRoom.name}`} onClose={() => !downloading && setConfirmAll(false)} closeDisabled={downloading}>
          <div className="grid gap-4">
            <p className="text-sm text-stone-600">
              Mọi em trong lớp nhận PIN mới; PIN cũ hết dùng được và các em bị đăng xuất. Mã học sinh giữ nguyên. Em chưa có tài khoản
              cũng được cấp luôn. Hãy phát phiếu mới cho cả lớp.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={downloading} onClick={() => setConfirmAll(false)}>
                Đóng
              </Button>
              <Button type="button" variant="danger" disabled={downloading} onClick={() => download("all")}>
                <RefreshCw className="h-4 w-4" />
                {downloading ? "Đang cấp..." : "Cấp lại và tải phiếu"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </Panel>
  );
}

function ResetPinButton({ student }: { student: StudentRow }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ResetPinState | null>(null);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  function reset() {
    startTransition(async () => {
      try {
        const next = await resetStudentPinAction(student.id);
        if (next.error) toast.error(next.error);
        else {
          setResult(next);
          markStale();
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setResult(null);
  }

  return (
    <>
      <Button type="button" variant="ghost" className={smallButton} onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        PIN mới
      </Button>
      {open ? (
        <Modal title={`PIN mới cho ${student.fullName}`} onClose={close} closeDisabled={pending}>
          {result ? (
            <div className="grid gap-4">
              <dl className="grid grid-cols-2 gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-center">
                <div>
                  <dt className="text-xs text-stone-500">Mã học sinh</dt>
                  <dd className="font-mono text-2xl font-bold tracking-widest text-neutralText">{result.code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-stone-500">Mã PIN</dt>
                  <dd className="font-mono text-2xl font-bold tracking-widest text-primary">{result.pin}</dd>
                </div>
              </dl>
              <p className="text-sm text-stone-600">Ghi lại hoặc chụp màn hình gửi em. Đóng hộp này thì không xem lại PIN được nữa.</p>
              <div className="flex justify-end">
                <Button type="button" onClick={close}>
                  Đã ghi lại
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <p className="text-sm text-stone-600">
                PIN cũ của <strong>{student.fullName}</strong> hết dùng được và em bị đăng xuất khỏi thiết bị đang dùng. Mã học sinh giữ
                nguyên. Việc này cũng mở khoá nếu em đang bị khoá.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" disabled={pending} onClick={close}>
                  Đóng
                </Button>
                <Button type="button" disabled={pending} onClick={reset}>
                  <KeyRound className="h-4 w-4" />
                  {pending ? "Đang cấp..." : "Cấp PIN mới"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}
    </>
  );
}

function UnlockButton({ studentId }: { studentId: string }) {
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  return (
    <Button
      type="button"
      variant="ghost"
      className={smallButton}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await unlockStudentAction(studentId);
            if (result.error) toast.error(result.error);
            else {
              toast.success(result.success);
              markStale();
            }
          } catch {
            toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
          }
        })
      }
    >
      <LockOpen className="h-3.5 w-3.5" />
      {pending ? "Đang mở..." : "Mở khoá"}
    </Button>
  );
}
