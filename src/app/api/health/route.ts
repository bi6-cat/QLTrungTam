import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    // LIMIT 0 keeps the probe cheap while PostgreSQL still resolves every
    // required table and column. This detects a reachable but stale schema.
    await prisma.$queryRaw`
      SELECT
        invoice."statusReason",
        transaction_row."paymentMethod",
        class_room."archivedAt",
        student."archivedAt",
        enrollment_month."status",
        audit_log."action"
      FROM "MonthlyInvoice" AS invoice
      CROSS JOIN "Transaction" AS transaction_row
      CROSS JOIN "ClassRoom" AS class_room
      CROSS JOIN "Student" AS student
      CROSS JOIN "EnrollmentMonth" AS enrollment_month
      CROSS JOIN "AuditLog" AS audit_log
      LIMIT 0
    `;
    return NextResponse.json(
      { status: "ok", database: "reachable" },
      { headers: NO_STORE_HEADERS }
    );
  } catch {
    return NextResponse.json(
      { status: "unhealthy", database: "unreachable" },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
