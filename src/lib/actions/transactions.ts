"use server";

import { errorState, successState, type ResultState } from "@/lib/action-states";
import { actionFailure, revalidateFinancialPaths } from "@/lib/actions/shared";
import { requireAdmin } from "@/lib/auth";
import {
  assignTransactionToInvoice,
  resolveUnmatchedTransaction,
  reverseTransaction,
  unassignTransaction
} from "@/lib/ledger";
import { settledSalaryNote } from "@/lib/salary";
import {
  assignTransactionSchema,
  resolveTransactionSchema,
  reverseTransactionSchema,
  safeParseForm,
  unassignTransactionSchema
} from "@/lib/validation";

const FAILURE = "Không thể cập nhật giao dịch.";

export async function assignTransactionAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(assignTransactionSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    const result = await assignTransactionToInvoice({
      transactionId: data.transactionId,
      invoiceId: data.invoiceId,
      actor: session,
      force: data.allowAmountMismatch,
      reason: data.reason
    });
    revalidateFinancialPaths();
    const note = await settledSalaryNote(result.invoiceId);
    return successState(`Đã gán giao dịch và ghi nhận thanh toán.${note}`);
  } catch (ledgerError) {
    return actionFailure(ledgerError, FAILURE);
  }
}

export async function resolveTransactionAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(resolveTransactionSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    await resolveUnmatchedTransaction({ transactionId: data.transactionId, actor: session, reason: data.reason });
    revalidateFinancialPaths();
    return successState("Đã đánh dấu giao dịch là đã xử lý.");
  } catch (ledgerError) {
    return actionFailure(ledgerError, FAILURE);
  }
}

export async function unassignTransactionAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(unassignTransactionSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    const result = await unassignTransaction({ transactionId: data.transactionId, actor: session, reason: data.reason });
    revalidateFinancialPaths();
    const note = await settledSalaryNote(result.invoiceId);
    return successState(`Đã bỏ gán; hóa đơn trở lại trạng thái chưa đóng.${note}`);
  } catch (ledgerError) {
    return actionFailure(ledgerError, FAILURE);
  }
}

export async function reverseTransactionAction(_prevState: ResultState, formData: FormData): Promise<ResultState> {
  const session = await requireAdmin();
  const { data, error } = safeParseForm(reverseTransactionSchema, formData);
  if (error || !data) return errorState(error ?? "Dữ liệu không hợp lệ.");

  try {
    const result = await reverseTransaction({ transactionId: data.transactionId, actor: session, reason: data.reason });
    revalidateFinancialPaths();
    const note = await settledSalaryNote(result.invoiceId);
    return successState(`Đã hoàn tác giao dịch và giữ lại lịch sử đối soát.${note}`);
  } catch (ledgerError) {
    return actionFailure(ledgerError, FAILURE);
  }
}
