"use client";

import { startTransition, useActionState } from "react";

/**
 * useActionState nhưng gọi action qua onSubmit thay vì prop `action` của form: React 19 xoá trắng
 * form sau mỗi lần submit bằng prop `action`, kể cả khi action trả lỗi, làm mất danh sách từ vừa
 * dán hay tên đăng nhập vừa gõ. Nút submit được gửi kèm (name/value) như submit thường.
 */
export function useKeepValuesAction<S>(action: (state: Awaited<S>, formData: FormData) => S | Promise<S>, initial: Awaited<S>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
