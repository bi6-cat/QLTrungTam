import { NextResponse } from "next/server";
import { resolveClassLink } from "@/lib/class-link-resolver";
import { getStudentPayInvoices } from "@/lib/pay-portal";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Hóa đơn của học sinh phụ huynh vừa chọn trên trang /pay/<MÃ LỚP>-<mã>. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string; studentId: string }> }
) {
  const { slug, studentId } = await context.params;
  const resolved = await resolveClassLink(slug, "pay");
  if (resolved?.kind !== "class") {
    return noStoreJson({ error: "Không tìm thấy lớp học." }, { status: 404 });
  }

  const invoices = await getStudentPayInvoices(resolved.classId, studentId);
  if (!invoices) {
    return noStoreJson({ error: "Không tìm thấy học sinh trong lớp." }, { status: 404 });
  }
  return noStoreJson({ invoices });
}
