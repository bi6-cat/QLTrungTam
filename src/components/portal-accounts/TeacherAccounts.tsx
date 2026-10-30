"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { BookOpen, KeyRound, Languages, Lock, LockOpen, UserPlus } from "lucide-react";
import {
  createTeacherAction,
  resetTeacherPasswordAction,
  setTeacherClassesAction,
  setTeacherDisabledAction,
  setTeacherVocabAction,
  unlockTeacherAction
} from "@/app/admin/accounts/actions";
import { EMPTY_RESULT_STATE, type ResultState } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { toast, useResultToast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Badge, Button, Field, Input, Panel } from "@/components/ui";

type TeacherRow = {
  id: string;
  username: string;
  fullName: string;
  disabled: boolean;
  vocabEnabled: boolean;
  /** ISO, chỉ có khi đang bị khoá vì nhập sai. */
  lockedUntil: string | null;
  classIds: string[];
  classNames: string[];
};

type ClassRow = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  assignedTo: { id: string; name: string } | null;
};

const smallButton = "h-8 gap-1 rounded-lg px-2 text-xs text-stone-600 hover:bg-indigo-50 hover:text-primary";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

export function TeacherAccounts({
  teachers,
  classes,
  nameSuggestions
}: {
  teachers: TeacherRow[];
  classes: ClassRow[];
  nameSuggestions: string[];
}) {
  return (
    <div className="grid gap-5">
      <Panel>
        <h2 className="mb-4 text-lg font-bold text-neutralText">Giáo viên ({teachers.length})</h2>
        {teachers.length === 0 ? (
          <p className="text-sm text-stone-500">Chưa có tài khoản giáo viên nào. Tạo tài khoản đầu tiên ở bên dưới.</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {teachers.map((teacher) => (
              <li key={teacher.id} className="grid gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {teacher.fullName}
                      {teacher.disabled ? (
                        <Badge tone="neutral">Đã khoá</Badge>
                      ) : teacher.lockedUntil ? (
                        <Badge tone="warning">Nhập sai nhiều lần, khoá đến {formatTime(teacher.lockedUntil)}</Badge>
                      ) : (
                        <Badge tone="success">Đang dùng</Badge>
                      )}
                      {teacher.vocabEnabled ? <Badge tone="primary">Từ vựng</Badge> : null}
                    </p>
                    <p className="font-mono text-xs text-stone-500">{teacher.username}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <ClassesButton teacher={teacher} classes={classes} />
                    <ResetPasswordButton teacher={teacher} />
                    <QuickActionButton
                      label={teacher.vocabEnabled ? "Tắt từ vựng" : "Bật từ vựng"}
                      icon={<Languages className="h-3.5 w-3.5" />}
                      run={() => setTeacherVocabAction(teacher.id, !teacher.vocabEnabled)}
                    />
                    {teacher.lockedUntil && !teacher.disabled ? (
                      <QuickActionButton
                        label="Mở khoá"
                        icon={<LockOpen className="h-3.5 w-3.5" />}
                        run={() => unlockTeacherAction(teacher.id)}
                      />
                    ) : null}
                    <DisableButton teacher={teacher} />
                  </div>
                </div>
                <p className="text-sm text-stone-600">
                  {teacher.classNames.length > 0 ? teacher.classNames.join(" · ") : <span className="text-stone-400">Chưa gán lớp</span>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <h2 className="mb-1 text-lg font-bold text-neutralText">Tạo tài khoản giáo viên</h2>
        <p className="mb-4 text-sm text-stone-600">
          Ghi họ tên đúng như ô &quot;Giáo viên&quot; của lớp thì các lớp đó được gán tự động. Lớp ghi tên khác vẫn gán tay được sau.
        </p>
        <CreateTeacherForm nameSuggestions={nameSuggestions} />
      </Panel>
    </div>
  );
}

function CreateTeacherForm({ nameSuggestions }: { nameSuggestions: string[] }) {
  const [state, action, pending] = useActionState(createTeacherAction, EMPTY_RESULT_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  useResultToast(state);
  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Họ tên">
          <Input name="fullName" list="teacher-name-suggestions" autoComplete="off" placeholder="vd: Cô Trang" required maxLength={80} />
          <datalist id="teacher-name-suggestions">
            {nameSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </Field>
        <Field label="Tên đăng nhập">
          <Input
            name="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="vd: co.trang"
            required
            minLength={3}
            maxLength={40}
          />
        </Field>
        <Field label="Mật khẩu (≥ 8 ký tự)">
          <Input name="password" type="password" autoComplete="new-password" required minLength={8} />
        </Field>
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="vocabEnabled" className="mt-0.5 h-4 w-4 accent-primary" />
        <span>
          <span className="font-medium text-neutralText">Bật kiểm tra từ vựng</span>
          <span className="block text-xs text-stone-500">Cho giáo viên ngoại ngữ: tạo bộ từ và giao bài kiểm tra từ vựng. Bật/tắt lại được sau.</span>
        </span>
      </label>
      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
      <div>
        <Button type="submit" disabled={pending}>
          <UserPlus className="h-4 w-4" />
          {pending ? "Đang tạo..." : "Tạo tài khoản"}
        </Button>
      </div>
    </form>
  );
}

function ClassesButton({ teacher, classes }: { teacher: TeacherRow; classes: ClassRow[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(setTeacherClassesAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" variant="ghost" className={smallButton} onClick={() => setOpen(true)}>
        <BookOpen className="h-3.5 w-3.5" />
        Gán lớp
      </Button>
      {open ? (
        <Modal title={`Lớp của ${teacher.fullName}`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <form action={action} className="grid gap-4">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <p className="text-sm text-stone-600">
              Chỉ đổi lớp hiện trên cổng giáo viên. Tên giáo viên dùng để tính lương và báo cáo của lớp giữ nguyên.
            </p>
            <ul className="grid max-h-[50vh] gap-1 overflow-y-auto rounded-xl border border-stone-200 p-2">
              {classes.map((c) => {
                const otherTeacher = c.assignedTo && c.assignedTo.id !== teacher.id ? c.assignedTo.name : null;
                return (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-stone-50">
                      <input
                        type="checkbox"
                        name="classId"
                        value={c.id}
                        defaultChecked={teacher.classIds.includes(c.id)}
                        className="mt-1 h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-neutralText">
                          {c.name} <span className="font-mono text-xs text-stone-400">{c.shortCode}</span>
                        </span>
                        <span className="block text-xs text-stone-500">
                          GV ghi trên lớp: {c.teacherName || "chưa ghi"}
                          {otherTeacher ? ` · đang gán cho ${otherTeacher}, tick sẽ chuyển sang` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

function ResetPasswordButton({ teacher }: { teacher: TeacherRow }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(resetTeacherPasswordAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state]);

  return (
    <>
      <Button type="button" variant="ghost" className={smallButton} onClick={() => setOpen(true)}>
        <KeyRound className="h-3.5 w-3.5" />
        Đổi mật khẩu
      </Button>
      {open ? (
        <Modal title={`Đặt lại mật khẩu ${teacher.username}`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <form action={action} className="grid gap-4">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <Field label="Mật khẩu mới (≥ 8 ký tự)">
              <Input name="password" type="password" autoComplete="new-password" required minLength={8} autoFocus />
            </Field>
            <p className="text-xs text-stone-500">Đặt lại cũng mở khoá đăng nhập và đăng xuất giáo viên khỏi mọi thiết bị.</p>
            {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="submit" disabled={pending}>
                <KeyRound className="h-4 w-4" />
                {pending ? "Đang lưu..." : "Đặt lại"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </>
  );
}

/** Nút gọi một action không cần nhập liệu, báo kết quả bằng toast. */
function QuickActionButton({ label, icon, run }: { label: string; icon: React.ReactNode; run: () => Promise<ResultState> }) {
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
            const result = await run();
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
      {icon}
      {pending ? "Đang lưu..." : label}
    </Button>
  );
}

function DisableButton({ teacher }: { teacher: TeacherRow }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending, () => setOpen(false));

  if (teacher.disabled) {
    return (
      <QuickActionButton
        label="Mở lại"
        icon={<LockOpen className="h-3.5 w-3.5" />}
        run={() => setTeacherDisabledAction(teacher.id, false)}
      />
    );
  }

  function confirm() {
    startTransition(async () => {
      try {
        const result = await setTeacherDisabledAction(teacher.id, true);
        if (result.error) toast.error(result.error);
        else {
          toast.success(result.success);
          markStale();
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-8 gap-1 rounded-lg px-2 text-xs text-stone-500 hover:bg-rose-50 hover:text-warning"
        onClick={() => setOpen(true)}
      >
        <Lock className="h-3.5 w-3.5" />
        Khoá
      </Button>
      {open ? (
        <Modal title={`Khoá tài khoản ${teacher.username}`} onClose={() => !pending && setOpen(false)} closeDisabled={pending}>
          <div className="grid gap-4">
            <p className="text-sm text-stone-600">
              <strong>{teacher.fullName}</strong> bị đăng xuất ngay và không đăng nhập cổng giáo viên được nữa. Lớp đã gán và dữ liệu
              giữ nguyên; có thể mở lại bất cứ lúc nào.
            </p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                Đóng
              </Button>
              <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
                <Lock className="h-4 w-4" />
                {pending ? "Đang khoá..." : "Khoá tài khoản"}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
