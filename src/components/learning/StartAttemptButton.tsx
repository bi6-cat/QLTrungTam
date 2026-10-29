"use client";

import { useActionState } from "react";
import { Play } from "lucide-react";
import { startAttemptAction } from "@/app/learn/actions";
import { EMPTY_RESULT_STATE } from "@/lib/action-states";
import { Button } from "@/components/ui";

export function StartAttemptButton({ assignmentId, resume }: { assignmentId: string; resume: boolean }) {
  const [state, action, pending] = useActionState(startAttemptAction, EMPTY_RESULT_STATE);
  const label = resume ? "Làm tiếp" : "Bắt đầu làm bài";

  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="assignmentId" value={assignmentId} />
      <Button type="submit" disabled={pending} className="h-12 w-full sm:w-auto sm:px-6">
        <Play className="h-4 w-4" />
        {pending ? "Đang mở bài..." : label}
      </Button>
      {state.error ? <p className="text-sm font-medium text-warning">{state.error}</p> : null}
    </form>
  );
}
