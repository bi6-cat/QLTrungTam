"use client";

import { useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { setSurveyCommentHiddenAction } from "@/lib/actions/surveys";
import { toast } from "@/components/Toaster";
import { useRefreshWhenIdle } from "@/components/useRefreshWhenIdle";
import { Button } from "@/components/ui";

/** Ẩn / hiện lại một góp ý không phù hợp trên trang kết quả (phiếu vẫn giữ nguyên). */
export function CommentVisibilityButton({
  responseId,
  questionId,
  hidden
}: {
  responseId: string;
  questionId: string;
  hidden: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const markStale = useRefreshWhenIdle(pending);

  function toggle() {
    startTransition(async () => {
      try {
        const result = await setSurveyCommentHiddenAction(responseId, questionId, !hidden);
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
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      onClick={toggle}
      className="h-7 w-7 shrink-0 rounded-lg px-0 text-stone-400 hover:text-neutralText"
      aria-label={hidden ? "Hiện lại góp ý" : "Ẩn góp ý"}
      title={hidden ? "Hiện lại góp ý" : "Ẩn góp ý"}
    >
      {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
    </Button>
  );
}
