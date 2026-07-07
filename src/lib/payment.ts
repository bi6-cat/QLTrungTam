import { prisma } from "@/lib/prisma";

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function buildMemo(shortCode: string, phone: string, month: number, year: number) {
  const yearCode = String(year % 100).padStart(2, "0");
  return `HP ${shortCode.toUpperCase()} ${normalizePhone(phone)} ${yearCode}T${month}`;
}

export function parseMemo(content: string) {
  const match = content
    .toUpperCase()
    .match(/\bHP\s+([A-Z0-9_-]+)\s+(\d{8,12})\s+(?:(\d{2})T|T)(1[0-2]|[1-9])\b/);

  if (!match) return null;

  return {
    shortCode: match[1],
    phone: normalizePhone(match[2]),
    year: match[3] ? 2000 + Number(match[3]) : null,
    month: Number(match[4])
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

export function buildVietQrDeepLink(memo: string, amount: number) {
  const search = new URLSearchParams({ memo, amount: String(amount) });
  return `vietqr://pay?${search.toString()}`;
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
      enrollment: {
        classRoom: { shortCode: parsed.shortCode },
        student: { phone: parsed.phone }
      }
    },
    include: {
      enrollment: { include: { classRoom: true, student: true } }
    }
  });

  if (invoices.length !== 1) {
    return {
      invoice: null,
      reason: invoices.length === 0 ? "Khong tim thay hoa don phu hop" : "Co nhieu hoa don trung memo"
    };
  }

  if (invoices[0].amount !== args.amount) {
    return { invoice: null, reason: "So tien khong khop" };
  }

  return { invoice: invoices[0], reason: null };
}
