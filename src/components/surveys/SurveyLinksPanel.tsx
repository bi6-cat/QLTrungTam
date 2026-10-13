"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Copy, ExternalLink, MessageSquareText, Save } from "lucide-react";
import { setSurveyClassesAction } from "@/lib/actions/surveys";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { toast, useResultToast } from "@/components/Toaster";
import { Button, EmptyState } from "@/components/ui";
import type { SurveyAudience } from "@/lib/survey-core";

export type SurveyLinkClass = {
  id: string;
  name: string;
  shortCode: string;
  teacherName: string;
  studentCount: number;
  responseCount: number;
  /** Đường dẫn /survey/... nếu lớp đang được gửi khảo sát. */
  path: string | null;
};

function inviteMessage(audience: SurveyAudience, surveyTitle: string, className: string, url: string) {
  const who =
    audience === "parent"
      ? `quý phụ huynh lớp ${className}`
      : audience === "both"
        ? `các em học sinh và quý phụ huynh lớp ${className}`
        : `các em lớp ${className}`;
  return [
    `📋 Khảo sát ẩn danh: ${surveyTitle}`,
    `Trung tâm APLUS ACADEMY mời ${who} dành 2–3 phút góp ý để trung tâm phục vụ tốt hơn.`,
    "Phiếu hoàn toàn ẩn danh, không cần ghi tên — trung tâm không biết ai đã trả lời.",
    `👉 ${url}`
  ].join("\n");
}

export function SurveyLinksPanel({
  surveyId,
  surveyTitle,
  audience,
  appUrl,
  acceptsResponses,
  classes
}: {
  surveyId: string;
  surveyTitle: string;
  audience: SurveyAudience;
  appUrl: string;
  acceptsResponses: boolean;
  classes: SurveyLinkClass[];
}) {
  const [state, action, pending] = useActionState(setSurveyClassesAction, EMPTY_RESULT_STATE);
  useResultToast(state);
  const [checked, setChecked] = useState(() => new Set(classes.filter((c) => c.path).map((c) => c.id)));
  const dirty =
    classes.some((c) => Boolean(c.path) !== checked.has(c.id));

  // Chưa cài "Địa chỉ web" trong Cài đặt thì lấy địa chỉ trang admin đang mở.
  function fullUrl(path: string) {
    const base = (appUrl || window.location.origin).replace(/\/$/, "");
    return `${base}${path}`;
  }

  async function copy(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error("Trình duyệt chặn sao chép, hãy mở link rồi sao chép thủ công.");
    }
  }

  function toggle(classId: string) {
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  if (classes.length === 0) {
    return <EmptyState title="Chưa có lớp đang hoạt động">Tạo lớp ở mục Lớp học trước khi gửi khảo sát.</EmptyState>;
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="surveyId" value={surveyId} />
      {!acceptsResponses ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Khảo sát chưa mở (hoặc đã đóng) nên link chưa nhận phiếu. Bấm “Mở khảo sát” ở đầu trang khi đã sẵn sàng.</span>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-stone-200">
        <ul className="divide-y divide-stone-100">
          {classes.map((classRoom) => {
            const isChecked = checked.has(classRoom.id);
            const linkReady = Boolean(classRoom.path) && isChecked;
            return (
              <li key={classRoom.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="flex min-w-0 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    name="classId"
                    value={classRoom.id}
                    checked={isChecked}
                    onChange={() => toggle(classRoom.id)}
                    className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-neutralText">
                      {classRoom.name} <span className="text-xs font-normal text-stone-400">({classRoom.shortCode})</span>
                    </span>
                    <span className="block text-xs text-stone-500">
                      {classRoom.teacherName || "Chưa có giáo viên"} · {classRoom.studentCount} HS đang học ·{" "}
                      <strong className="font-semibold text-neutralText">{classRoom.responseCount} phiếu</strong>
                    </span>
                  </span>
                </label>
                {linkReady && classRoom.path ? (
                  <div className="flex shrink-0 flex-wrap gap-1.5 pl-7 sm:pl-0">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                      onClick={() =>
                        copy(
                          inviteMessage(audience, surveyTitle, classRoom.name, fullUrl(classRoom.path as string)),
                          `Đã chép tin nhắn mời lớp ${classRoom.name}.`
                        )
                      }
                    >
                      <MessageSquareText className="h-3.5 w-3.5" />
                      Chép tin nhắn
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-9 px-3 text-xs"
                      onClick={() => copy(fullUrl(classRoom.path as string), `Đã chép link lớp ${classRoom.name}.`)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Chép link
                    </Button>
                    <a
                      href={classRoom.path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-600 shadow-sm hover:bg-stone-50"
                      aria-label={`Mở trang khảo sát lớp ${classRoom.name}`}
                      title="Mở trang khảo sát"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                ) : isChecked ? (
                  <span className="pl-7 text-xs text-stone-400 sm:pl-0">Lưu để tạo link</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>

      {state.error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.error}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-stone-500">
          Mỗi lớp một link riêng để kết quả tách được theo lớp và giáo viên. Bỏ chọn một lớp thì link của lớp đó ngừng hoạt
          động; phiếu đã nộp vẫn giữ.
        </p>
        <Button type="submit" disabled={pending || !dirty}>
          <Save className="h-4 w-4" />
          {pending ? "Đang lưu..." : "Lưu danh sách lớp"}
        </Button>
      </div>
    </form>
  );
}
