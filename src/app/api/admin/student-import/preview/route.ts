import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  coerceStudentImportRows,
  parseStudentImportWorkbook,
  StudentImportFileError
} from "@/lib/student-import";
import { validateStudentImportRows } from "@/lib/student-import-server";
import { MAX_STUDENT_IMPORT_FILE_BYTES } from "@/lib/student-import-types";

export const runtime = "nodejs";

function errorResponse(error: unknown, status = 400) {
  if (error instanceof StudentImportFileError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Không thể kiểm tra dữ liệu nhập." },
    { status }
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Bạn cần đăng nhập lại." }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_STUDENT_IMPORT_FILE_BYTES + 512_000) {
    return NextResponse.json({ error: "Tệp tải lên vượt quá giới hạn 5 MB." }, { status: 413 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    let rows;
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Vui lòng chọn tệp Excel." }, { status: 400 });
      }
      if (file.size <= 0) {
        return NextResponse.json({ error: "Tệp Excel đang trống." }, { status: 400 });
      }
      if (file.size > MAX_STUDENT_IMPORT_FILE_BYTES) {
        return NextResponse.json({ error: "Tệp tải lên vượt quá giới hạn 5 MB." }, { status: 413 });
      }
      if (!/\.(xlsx|xls)$/i.test(file.name)) {
        return NextResponse.json(
          { error: "Chỉ nhận tệp Excel có đuôi .xlsx hoặc .xls." },
          { status: 415 }
        );
      }
      rows = await parseStudentImportWorkbook(await file.arrayBuffer());
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as { rows?: unknown };
      rows = coerceStudentImportRows(body.rows);
    } else {
      return NextResponse.json(
        { error: "Định dạng yêu cầu không được hỗ trợ." },
        { status: 415 }
      );
    }

    const preview = await validateStudentImportRows(prisma, rows);
    return NextResponse.json(preview);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Dữ liệu gửi lên không hợp lệ." }, { status: 400 });
    }
    return errorResponse(error);
  }
}
