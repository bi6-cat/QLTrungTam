import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const searchSchema = z.object({
  q: z.string().trim().max(100).refine((value) => !value.includes("\0")).default(""),
  amount: z.coerce.number().int().min(1).max(2_147_483_647),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  take: z.coerce.number().int().min(1).max(20).default(8)
});

type InvoiceSearchRow = {
  id: string;
  amount: number;
  sessions: number;
  pricePerSession: number;
  month: number;
  year: number;
  memoContent: string;
  studentName: string;
  studentPhone: string;
  className: string;
  classShortCode: string;
  teacherName: string;
  studentArchived: boolean;
  classArchived: boolean;
};

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function escapeLikePattern(value: string) {
  return value.replace(/[!%_]/g, (character) => `!${character}`);
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return noStoreJson({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = searchSchema.safeParse({
    q: url.searchParams.get("q") ?? undefined,
    amount: url.searchParams.get("amount") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    take: url.searchParams.get("take") ?? undefined
  });

  if (!parsed.success) {
    return noStoreJson(
      { error: "Tham số tìm kiếm hóa đơn không hợp lệ." },
      { status: 400 }
    );
  }

  const { q, amount, page, take } = parsed.data;
  const pattern = `%${escapeLikePattern(q)}%`;
  const searchCondition = q
    ? Prisma.sql`
        AND (
          mi."memoContent" ILIKE ${pattern} ESCAPE '!'
          OR mi."studentNameSnapshot" ILIKE ${pattern} ESCAPE '!'
          OR mi."studentPhoneSnapshot" ILIKE ${pattern} ESCAPE '!'
          OR mi."classNameSnapshot" ILIKE ${pattern} ESCAPE '!'
          OR mi."classShortCodeSnapshot" ILIKE ${pattern} ESCAPE '!'
          OR s."fullName" ILIKE ${pattern} ESCAPE '!'
          OR s."phone" ILIKE ${pattern} ESCAPE '!'
          OR c."name" ILIKE ${pattern} ESCAPE '!'
          OR c."shortCode" ILIKE ${pattern} ESCAPE '!'
        )
      `
    : Prisma.empty;

  const countRows = await prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    SELECT COUNT(*)::integer AS count
    FROM "MonthlyInvoice" mi
    INNER JOIN "Enrollment" e ON e.id = mi."enrollmentId"
    INNER JOIN "Student" s ON s.id = e."studentId"
    INNER JOIN "ClassRoom" c ON c.id = e."classId"
    WHERE mi.status = 'unpaid'
    ${searchCondition}
  `);
  const total = countRows[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / take));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * take;

  const items = await prisma.$queryRaw<InvoiceSearchRow[]>(Prisma.sql`
    SELECT
      mi.id,
      mi.amount,
      mi.sessions,
      mi."pricePerSession",
      mi.month,
      mi.year,
      mi."memoContent",
      COALESCE(mi."studentNameSnapshot", s."fullName") AS "studentName",
      COALESCE(mi."studentPhoneSnapshot", s.phone) AS "studentPhone",
      COALESCE(mi."classNameSnapshot", c.name) AS "className",
      COALESCE(mi."classShortCodeSnapshot", c."shortCode") AS "classShortCode",
      COALESCE(mi."teacherNameSnapshot", c."teacherName", '') AS "teacherName",
      (s."archivedAt" IS NOT NULL) AS "studentArchived",
      (c."archivedAt" IS NOT NULL) AS "classArchived"
    FROM "MonthlyInvoice" mi
    INNER JOIN "Enrollment" e ON e.id = mi."enrollmentId"
    INNER JOIN "Student" s ON s.id = e."studentId"
    INNER JOIN "ClassRoom" c ON c.id = e."classId"
    WHERE mi.status = 'unpaid'
    ${searchCondition}
    ORDER BY
      CASE WHEN mi.amount = ${amount} THEN 0 ELSE 1 END ASC,
      ABS(mi.amount - ${amount}) ASC,
      mi.year DESC,
      mi.month DESC,
      mi.id ASC
    LIMIT ${take}
    OFFSET ${offset}
  `);

  return noStoreJson({
    items,
    page: currentPage,
    take,
    total,
    totalPages
  });
}
