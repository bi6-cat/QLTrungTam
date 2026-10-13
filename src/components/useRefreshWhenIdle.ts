"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Nạp lại dữ liệu trang sau khi lưu, nhưng chỉ khi nút đã hết trạng thái "Đang lưu...".
 *
 * Server action không revalidatePath (xem src/lib/actions/shared.ts): kèm cây RSC của trang
 * trong response làm transition của action treo mãi khi các Link đã prefetch xong. Ở đây
 * router.refresh() chạy trong effect sau khi `pending` về false, nên nó là một transition
 * riêng, không kéo trạng thái của nút theo.
 *
 * Dùng: `const markStale = useRefreshWhenIdle(pending)`, gọi `markStale()` khi action thành công.
 * Hộp thoại tự gỡ khi đóng thì truyền việc đóng vào `onIdle` thay vì đóng ngay trong action,
 * để effect còn kịp chạy trước khi component biến mất.
 */
export function useRefreshWhenIdle(pending: boolean, onIdle?: () => void) {
  const router = useRouter();
  const stale = useRef(false);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (pending || !stale.current) return;
    stale.current = false;
    router.refresh();
    onIdleRef.current?.();
  }, [pending, router]);

  return useCallback(() => {
    stale.current = true;
  }, []);
}
