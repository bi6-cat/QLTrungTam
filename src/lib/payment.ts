import { prisma } from "@/lib/prisma";

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

// Anh chị em dùng chung SĐT phụ huynh và học cùng lớp thì memo sẽ trùng. Người đầu tiên giữ memo
// gốc; người thứ hai trở đi thêm một chữ cái ngay sau SĐT (B, C, ...). Bỏ A và T: T là ký hiệu tháng
// ("0912345678T8"), còn "không hậu tố" đã là bản gốc.
export const MEMO_SUFFIXES = ["", "B", "C", "D", "E", "F", "G", "H"] as const;

export function buildMemo(shortCode: string, phone: string, month: number, year: number, suffix = "") {
  const yearCode = String(year % 100).padStart(2, "0");
  return `HP ${shortCode.toUpperCase()} ${normalizePhone(phone)}${suffix.toUpperCase()} ${yearCode}T${month}`;
}

/** Hậu tố đầu tiên chưa bị dùng; null khi đã hết (quá 8 học sinh chung SĐT trong một lớp). */
export function pickMemoSuffix(usedSuffixes: Iterable<string>) {
  const used = new Set(usedSuffixes);
  return MEMO_SUFFIXES.find((suffix) => !used.has(suffix)) ?? null;
}

/** Hậu tố các memo đã phát hành cho đúng SĐT này (memo không đọc được tính như không hậu tố). */
export function usedMemoSuffixes(memos: Iterable<string>, phone: string) {
  const normalizedPhone = normalizePhone(phone);
  const used: string[] = [];
  for (const memo of memos) {
    const parsed = parseMemo(memo);
    if (parsed && parsed.phone === normalizedPhone) used.push(parsed.suffix);
  }
  return used;
}

/**
 * Dự đoán memo cho các học sinh sắp được phát hành hóa đơn trong cùng một lớp/kỳ, theo đúng thứ tự
 * truyền vào (cũng là thứ tự lúc tạo hóa đơn). `issuedMemos` là memo các hóa đơn đã có của lớp/kỳ đó.
 */
export function predictMemos(args: {
  shortCode: string;
  month: number;
  year: number;
  issuedMemos: string[];
  pending: Array<{ key: string; phone: string }>;
}) {
  const memos = [...args.issuedMemos];
  const result = new Map<string, { memo: string; suffix: string }>();
  for (const item of args.pending) {
    const suffix = pickMemoSuffix(usedMemoSuffixes(memos, item.phone)) ?? "";
    const memo = buildMemo(args.shortCode, item.phone, args.month, args.year, suffix);
    memos.push(memo);
    result.set(item.key, { memo, suffix });
  }
  return result;
}

export function parseMemo(content: string) {
  const normalizedContent = content.toUpperCase();
  const match =
    normalizedContent.match(
      /\bHP\s+([A-Z0-9_-]+)\s+(\d{8,12})([B-H])?\s+(?:(\d{2})T|T)(1[0-2]|[1-9])\b/
    ) ??
    // Một số ngân hàng loại bỏ khoảng trắng trong phần đầu nội dung chuyển khoản,
    // ví dụ: "HP LS12A 0987787878 26T8" -> "HPLS12A0987787878 26T8".
    // Ưu tiên dạng số Việt Nam để xác định đúng ranh giới giữa mã lớp và SĐT.
    normalizedContent.match(
      /\bHP\s*([A-Z0-9_-]+?)\s*(0\d{9}|84\d{9})([B-H])?\s*(?:(\d{2})T|T)(1[0-2]|[1-9])\b/
    );

  if (!match) return null;

  return {
    shortCode: match[1],
    phone: normalizePhone(match[2]),
    suffix: match[3] ?? "",
    year: match[4] ? 2000 + Number(match[4]) : null,
    month: Number(match[5])
  };
}

export function buildVietQrImageUrl(params: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  memo: string;
}) {
  const search = new URLSearchParams({
    amount: String(params.amount),
    addInfo: params.memo,
    accountName: params.accountName
  });
  return `https://img.vietqr.io/image/${params.bankBin}-${params.accountNumber}-compact2.png?${search.toString()}`;
}

export async function matchInvoiceFromTransaction(args: {
  content: string;
  amount: number;
  transferredAt: Date;
}) {
  const parsed = parseMemo(args.content);
  if (!parsed) {
    return { invoice: null, reason: "Sai cu phap memo" };
  }

  const invoices = await prisma.monthlyInvoice.findMany({
    where: {
      month: parsed.month,
      ...(parsed.year ? { year: parsed.year } : {}),
      status: "unpaid",
      enrollment: { classRoom: { shortCode: parsed.shortCode } },
      // Memo của hóa đơn được tạo theo SĐT lúc phát hành (lưu ở studentPhoneSnapshot), nên
      // so với SĐT đó chứ không phải SĐT hiện tại — admin có thể đã sửa SĐT sau khi tạo hóa đơn.
      // Hóa đơn rất cũ chưa có snapshot thì mới so với SĐT hiện tại của học sinh.
      OR: [
        { studentPhoneSnapshot: parsed.phone },
        { studentPhoneSnapshot: null, enrollment: { student: { phone: parsed.phone } } }
      ]
    },
    include: {
      enrollment: { include: { classRoom: true, student: true } }
    }
  });

  // Hậu tố chỉ nằm trong memo hóa đơn (không có cột riêng): chuyển khoản có hậu tố B chỉ khớp hóa đơn
  // phát hành với hậu tố B, còn memo gốc chỉ khớp hóa đơn không hậu tố.
  const candidates = invoices.filter(
    (invoice) => (parseMemo(invoice.memoContent)?.suffix ?? "") === parsed.suffix
  );

  if (candidates.length !== 1) {
    return {
      invoice: null,
      reason: candidates.length === 0 ? "Khong tim thay hoa don phu hop" : "Co nhieu hoa don trung memo"
    };
  }

  if (candidates[0].amount !== args.amount) {
    return { invoice: null, reason: "So tien khong khop" };
  }

  return { invoice: candidates[0], reason: null };
}
