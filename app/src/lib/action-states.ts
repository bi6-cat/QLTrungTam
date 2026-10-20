import type { CreateStudentState } from "@/lib/actions";

/**
 * Giá trị khởi tạo cho useActionState.
 *
 * Phải nằm ngoài @/lib/actions vì file đó có "use server" và Next.js chỉ cho
 * phép export async function từ một server-action module.
 */
export const EMPTY_CREATE_STUDENT_STATE: CreateStudentState = {
  error: "",
  warning: "",
  success: ""
};

export const EMPTY_EDIT_STATE = { error: "", ok: false };

export const EMPTY_TRANSACTION_STATE = { error: "", success: "" };
