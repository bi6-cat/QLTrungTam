import { Badge } from "@/components/ui";
import type { AssignmentState } from "@/modules/learning";

const LABEL: Record<AssignmentState, { text: string; tone: "success" | "neutral" | "primary" }> = {
  open: { text: "Đang mở", tone: "success" },
  upcoming: { text: "Chưa mở", tone: "primary" },
  closed: { text: "Đã đóng", tone: "neutral" }
};

export function AssignmentStateBadge({ state }: { state: AssignmentState }) {
  return <Badge tone={LABEL[state].tone}>{LABEL[state].text}</Badge>;
}
