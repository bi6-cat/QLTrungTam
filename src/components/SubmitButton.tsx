"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Nút submit cho form dùng server action trực tiếp (trang server component):
 * tự khóa khi form đang gửi để tránh bấm lặp, tùy chọn đổi nhãn khi chờ.
 */
export function SubmitButton({
  pendingLabel,
  children,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingLabel?: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
