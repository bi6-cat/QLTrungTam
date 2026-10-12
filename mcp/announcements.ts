import { formatCurrency, formatMonth } from "@/lib/format";

/**
 * Soạn thông báo để dán vào nhóm Zalo của lớp. Zalo không có API gửi vào nhóm cá nhân nên MCP
 * chỉ trả về nội dung; người dùng chép và dán. Hàm thuần, không chạm DB.
 */

export type NoticeDetail = "names_amounts" | "names_only" | "summary_only";

export type NoticeDebtor = {
  studentName: string;
  totalAmount: number;
  invoices: Array<{ month: number; year: number; amount: number; monthsOverdue: number }>;
};

/** Zalo cắt tin quá dài; chia theo dòng để mỗi tin dưới ngưỡng này. */
export const ZALO_MESSAGE_LIMIT = 1800;

export function splitForZalo(message: string, limit = ZALO_MESSAGE_LIMIT) {
  if (message.length <= limit) return [message];
  const parts: string[] = [];
  let current = "";
  for (const line of message.split("\n")) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > limit && current) {
      parts.push(current);
      current = line;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function debtLine(debtor: NoticeDebtor, index: number, detail: NoticeDetail) {
  if (detail === "names_only") return `${index + 1}. ${debtor.studentName}`;
  const months = debtor.invoices
    .map((invoice) => `T${invoice.month}/${invoice.year}`)
    .filter((value, position, all) => all.indexOf(value) === position)
    .join(", ");
  const overdue = Math.max(0, ...debtor.invoices.map((invoice) => invoice.monthsOverdue));
  const overdueNote = overdue > 0 ? ` (quá hạn ${overdue} tháng)` : "";
  return `${index + 1}. ${debtor.studentName} — ${months}: ${formatCurrency(debtor.totalAmount)}${overdueNote}`;
}

export function composeGroupDebtNotice(input: {
  centerName: string;
  centerPhone: string;
  className: string;
  classShortCode: string;
  /** Tháng cần nhắc; null = mọi khoản đang nợ. */
  period: { month: number; year: number } | null;
  debtors: NoticeDebtor[];
  payUrl: string;
  detail: NoticeDetail;
  deadline?: string;
  extraNote?: string;
}) {
  const total = input.debtors.reduce((sum, debtor) => sum + debtor.totalAmount, 0);
  const scope = input.period ? ` ${formatMonth(input.period.month, input.period.year)}` : "";
  const lines: string[] = [
    `📢 THÔNG BÁO HỌC PHÍ — LỚP ${input.className} (${input.classShortCode})`,
    "",
    `${input.centerName} xin nhắc quý phụ huynh có con chưa hoàn thành học phí${scope}:`,
    ""
  ];

  if (input.detail === "summary_only") {
    lines.push(`• Còn ${input.debtors.length} học sinh chưa hoàn thành, tổng ${formatCurrency(total)}.`);
    lines.push("• Phụ huynh vào link bên dưới, chọn tên con để xem số tiền cụ thể.");
  } else {
    input.debtors.forEach((debtor, index) => lines.push(debtLine(debtor, index, input.detail)));
    lines.push("");
    lines.push(
      input.detail === "names_amounts"
        ? `Tổng: ${input.debtors.length} học sinh · ${formatCurrency(total)}`
        : `Tổng: ${input.debtors.length} học sinh`
    );
  }

  if (input.deadline) lines.push("", `⏰ Hạn đóng: ${input.deadline}`);
  if (input.payUrl) {
    lines.push(
      "",
      "👉 Phụ huynh đóng học phí tại link:",
      input.payUrl,
      "(Chọn tên con → quét mã QR → chuyển khoản. Nội dung chuyển khoản đã tự điền, không cần sửa.)"
    );
  }
  if (input.extraNote) lines.push("", input.extraNote);
  lines.push("", `Nếu đã chuyển khoản, xin bỏ qua tin này. Cần hỗ trợ xin liên hệ ${input.centerPhone}. Trân trọng cảm ơn!`);

  const message = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { message, parts: splitForZalo(message), debtorCount: input.debtors.length, totalAmount: total };
}

export type TuitionPlan = { sessions: number; amount: number; students: number };

/** Thông báo đầu kỳ: học phí tháng này của lớp, kèm link nộp. */
export function composeTuitionNotice(input: {
  centerName: string;
  centerPhone: string;
  className: string;
  classShortCode: string;
  month: number;
  year: number;
  plans: TuitionPlan[];
  payUrl: string;
  deadline?: string;
  extraNote?: string;
}) {
  const label = formatMonth(input.month, input.year);
  const lines: string[] = [
    `📢 THÔNG BÁO HỌC PHÍ ${label.toUpperCase()} — LỚP ${input.className} (${input.classShortCode})`,
    "",
    `${input.centerName} gửi quý phụ huynh thông báo học phí ${label.toLowerCase()}:`
  ];

  if (input.plans.length === 0) {
    lines.push("• (Lớp chưa có hoá đơn tháng này — hãy tạo hoá đơn trong app trước khi gửi.)");
  } else if (input.plans.length === 1) {
    const plan = input.plans[0];
    lines.push(`• ${plan.sessions} buổi · ${formatCurrency(plan.amount)}/học sinh`);
  } else {
    for (const plan of [...input.plans].sort((a, b) => b.students - a.students)) {
      lines.push(`• ${plan.sessions} buổi · ${formatCurrency(plan.amount)}/học sinh (${plan.students} em)`);
    }
  }

  if (input.deadline) lines.push("", `⏰ Hạn đóng: ${input.deadline}`);
  if (input.payUrl) {
    lines.push(
      "",
      "👉 Phụ huynh đóng học phí tại link:",
      input.payUrl,
      "(Chọn tên con → quét mã QR → chuyển khoản. Nội dung chuyển khoản đã tự điền, không cần sửa.)"
    );
  }
  if (input.extraNote) lines.push("", input.extraNote);
  lines.push("", `Cần hỗ trợ xin liên hệ ${input.centerPhone}. Trân trọng cảm ơn!`);

  const message = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { message, parts: splitForZalo(message) };
}
