"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Lock, Pencil, Play, RotateCcw, Save, Trash2 } from "lucide-react";
import { deleteSurveyAction, setSurveyStatusAction, updateSurveyAction } from "@/lib/actions/surveys";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Modal } from "@/components/Modal";
import { toast, useResultToast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { AUDIENCE_LABEL, SURVEY_AUDIENCES, type SurveyAudience, type SurveyStatus } from "@/lib/survey-core";

type SurveyInfo = {
  id: string;
  title: string;
  description: string;
  audience: SurveyAudience;
  status: SurveyStatus;
  closesOn: string | null;
  minGroupSize: number;
  responseCount: number;
};

export function SurveyHeaderActions({ survey }: { survey: SurveyInfo }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  function changeStatus(status: SurveyStatus) {
    startTransition(async () => {
      try {
        const result = await setSurveyStatusAction(survey.id, status);
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
      <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
        <Pencil className="h-4 w-4" />
        Sửa thông tin
      </Button>
      {survey.status === "open" ? (
        <Button type="button" variant="secondary" disabled={pending} onClick={() => changeStatus("closed")}>
          <Lock className="h-4 w-4" />
          {pending ? "Đang đóng..." : "Đóng khảo sát"}
        </Button>
      ) : (
        <Button type="button" disabled={pending} onClick={() => changeStatus("open")}>
          {survey.status === "closed" ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {pending ? "Đang mở..." : survey.status === "closed" ? "Mở lại" : "Mở khảo sát"}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        className="text-stone-500 hover:bg-rose-50 hover:text-warning"
        onClick={() => setDeleting(true)}
        aria-label="Xóa khảo sát"
        title="Xóa khảo sát"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {editing ? <EditSurveyDialog survey={survey} onClose={() => setEditing(false)} /> : null}
      {deleting ? <DeleteSurveyDialog survey={survey} onClose={() => setDeleting(false)} /> : null}
    </>
  );
}

function EditSurveyDialog({ survey, onClose }: { survey: SurveyInfo; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateSurveyAction, EMPTY_RESULT_STATE);
  useResultToast(state);

  useEffect(() => {
    if (state.success) onClose();
  }, [state, onClose]);

  const audienceLocked = survey.responseCount > 0;
  return (
    <Modal title="Thông tin khảo sát" onClose={() => !pending && onClose()} closeDisabled={pending}>
      <form action={action} className="grid gap-3">
        <input type="hidden" name="id" value={survey.id} />
        <Field label="Tên khảo sát">
          <Input name="title" required maxLength={150} defaultValue={survey.title} />
        </Field>
        <Field label="Lời giới thiệu" hint="Hiện ở đầu trang khảo sát">
          <Textarea name="description" maxLength={1000} rows={3} defaultValue={survey.description} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Người trả lời">
            {/* Ô bị khóa không gửi giá trị nên kèm ô ẩn giữ nguyên đối tượng. */}
            {audienceLocked ? <input type="hidden" name="audience" value={survey.audience} /> : null}
            <Select name="audience" defaultValue={survey.audience} disabled={audienceLocked}>
              {SURVEY_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ngày đóng" hint="Để trống = đóng tay">
            <Input name="closesOn" type="date" defaultValue={survey.closesOn ?? ""} />
          </Field>
        </div>
        <Field label="Số phiếu tối thiểu để xem kết quả theo nhóm" hint="1 = luôn hiện">
          <Input name="minGroupSize" type="number" min={1} max={20} required defaultValue={survey.minGroupSize} />
        </Field>
        <p className="text-xs text-stone-500">
          Đặt lớn hơn 1 nếu muốn ẩn kết quả của lớp (hoặc đối tượng) quá ít phiếu, để không đoán ra ai đã trả lời gì. Tab
          “Từng phiếu” luôn hiện đủ.
        </p>
        {state.error ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" disabled={pending}>
            <Save className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteSurveyDialog({ survey, onClose }: { survey: SurveyInfo; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await deleteSurveyAction(survey.id);
        if (result.error) {
          toast.error(result.error);
          onClose();
        } else {
          toast.success(result.success);
          router.push("/admin/surveys");
        }
      } catch {
        toast.error("Không kết nối được máy chủ. Vui lòng tải lại trang và thử lại.");
        onClose();
      }
    });
  }

  return (
    <Modal title="Xóa khảo sát?" onClose={() => !pending && onClose()} closeDisabled={pending}>
      <div className="grid gap-4">
        <p className="text-sm text-stone-600">
          Xóa vĩnh viễn <strong>{survey.title}</strong>
          {survey.responseCount > 0 ? <> cùng <strong>{survey.responseCount} phiếu trả lời</strong></> : null}. Các link
          đã gửi cho lớp sẽ ngừng hoạt động. Không thể hoàn tác.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Hủy
          </Button>
          <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
            <Trash2 className="h-4 w-4" />
            {pending ? "Đang xóa..." : "Xóa khảo sát"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
