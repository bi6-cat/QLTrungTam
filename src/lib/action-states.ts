/**
 * Kiểu kết quả và giá trị khởi tạo cho server action dùng với useActionState.
 *
 * Phải nằm ngoài các module "use server" vì Next.js chỉ cho phép module đó export
 * async function.
 */

/** Kết quả chung của mọi action: thành công thì có `success` để hiện thông báo. */
export type ResultState = { error: string; success: string };

export type CreateStudentState = ResultState & { warning: string };

export const EMPTY_RESULT_STATE: ResultState = { error: "", success: "" };

export const EMPTY_CREATE_STUDENT_STATE: CreateStudentState = {
  error: "",
  warning: "",
  success: ""
};

export function successState(success: string): ResultState {
  return { error: "", success };
}

export function errorState(error: string): ResultState {
  return { error, success: "" };
}
