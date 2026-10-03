"use client";

import Form from "next/form";

/** Form lọc dạng GET: đổi lựa chọn là áp dụng ngay, không cần bấm nút "Xem". */
export function AutoSubmitForm({
  action,
  className,
  children
}: {
  action: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Form
      action={action}
      prefetch={false}
      className={className}
      onChange={(event) => event.currentTarget.requestSubmit()}
    >
      {children}
    </Form>
  );
}
