import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runSerializable } from "@/lib/serializable";
import { normalizeName } from "@/lib/student-search";
import { createStudentSchema, updateStudentSchema } from "@/lib/validation";
import { findAnomalies, findDuplicateGroups, severityAtLeast, type CheckStudent, type Severity } from "./student-checks";
import { clampLimit, fail, guarded, json, MCP_ACTOR } from "./util";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false } as const;

const studentIdSchema = z.string().trim().min(1).max(64).describe("ID học sinh (lấy từ search_students)");
const reasonSchema = z.string().trim().max(500).optional().describe("Lý do, ghi vào nhật ký thay đổi");

const conflictError = () => new Error("Dữ liệu vừa được thay đổi bởi thao tác khác. Vui lòng thử lại.");

function audit(
  tx: Prisma.TransactionClient,
  action: string,
  entityId: string,
  reason: string | null | undefined,
  metadata: Record<string, unknown>
) {
  return tx.auditLog.create({
    data: {
      actorUserId: null,
      actorUsername: MCP_ACTOR,
      action,
      entityType: "Student",
      entityId,
      reason: reason || null,
      metadata: { source: "mcp", ...metadata } as Prisma.InputJsonValue
    }
  });
}

function snapshot(student: {
  fullName: string;
  phone: string;
  address: string;
  parentName: string | null;
  note: string | null;
  archivedAt: Date | null;
}) {
  return {
    fullName: student.fullName,
    phone: student.phone,
    address: student.address,
    parentName: student.parentName,
    note: student.note,
    archivedAt: student.archivedAt?.toISOString() ?? null
  };
}

function validationMessage(error: z.ZodError) {
  return error.issues.map((issue) => issue.message).join("; ");
}

async function loadCheckStudents(includeArchived: boolean): Promise<CheckStudent[]> {
  const students = await prisma.student.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      address: true,
      parentName: true,
      archivedAt: true,
      enrollments: {
        select: {
          leftAt: true,
          classRoom: { select: { shortCode: true } },
          invoices: { where: { status: "unpaid" }, select: { id: true } }
        }
      }
    }
  });
  return students.map((student) => ({
    id: student.id,
    fullName: student.fullName,
    phone: student.phone,
    address: student.address,
    parentName: student.parentName,
    archived: Boolean(student.archivedAt),
    activeClassCodes: student.enrollments
      .filter((enrollment) => !enrollment.leftAt)
      .map((enrollment) => enrollment.classRoom.shortCode),
    enrollmentCount: student.enrollments.length,
    unpaidInvoiceCount: student.enrollments.reduce((sum, enrollment) => sum + enrollment.invoices.length, 0)
  }));
}

/** Tool đọc: quét hồ sơ trùng/bất thường. Luôn đăng ký, kể cả khi tắt chế độ ghi. */
export function registerStudentCheckTools(server: McpServer) {
  const severitySchema = z.enum(["high", "medium", "low"]).optional();

  server.registerTool(
    "find_duplicate_students",
    {
      title: "Tìm học sinh trùng",
      description:
        "Quét toàn bộ hồ sơ tìm: trùng cả tên và SĐT, cùng SĐT tên gần giống (gõ sai), cùng tên khác SĐT, và học sinh cùng SĐT học chung lớp (mức thấp: thường là anh chị em, memo tự có hậu tố B, C...). Chỉ báo cáo, không sửa gì; sau đó dùng update_student / archive_student để xử lý.",
      inputSchema: {
        includeArchived: z.boolean().optional().describe("Gồm hồ sơ đã lưu trữ (mặc định: có, vì trùng với hồ sơ lưu trữ cũng cần biết)"),
        minSeverity: severitySchema.describe("high | medium | low (mặc định low = hiện hết)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ includeArchived, minSeverity }) => {
      const students = await loadCheckStudents(includeArchived ?? true);
      const groups = findDuplicateGroups(students).filter((group) =>
        severityAtLeast(group.severity, (minSeverity ?? "low") as Severity)
      );
      return json({ scanned: students.length, groupCount: groups.length, groups });
    })
  );

  server.registerTool(
    "find_student_anomalies",
    {
      title: "Tìm thông tin bất thường",
      description:
        "Quét hồ sơ học sinh tìm dữ liệu bất thường: SĐT sai định dạng/số điền tạm, tên có số hoặc ký tự lạ, tên một từ, viết toàn hoa/thường, thiếu địa chỉ, chưa ghi danh lớp nào, lưu trữ mà vẫn đang học hoặc còn nợ. Chỉ báo cáo, không sửa.",
      inputSchema: {
        includeArchived: z.boolean().optional().describe("Gồm hồ sơ đã lưu trữ (mặc định: có)"),
        minSeverity: severitySchema.describe("high | medium | low (mặc định medium để bớt nhiễu)"),
        limit: z.number().int().min(1).max(500).optional().describe("Tối đa số phát hiện trả về (mặc định 100)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ includeArchived, minSeverity, limit }) => {
      const students = await loadCheckStudents(includeArchived ?? true);
      const all = findAnomalies(students).filter((item) =>
        severityAtLeast(item.severity, (minSeverity ?? "medium") as Severity)
      );
      const max = clampLimit(limit, 100, 500);
      const byCode: Record<string, number> = {};
      for (const item of all) byCode[item.code] = (byCode[item.code] ?? 0) + 1;
      return json({ scanned: students.length, total: all.length, byCode, shown: Math.min(all.length, max), anomalies: all.slice(0, max) });
    })
  );
}

/** Tool ghi hồ sơ học sinh. Không đụng tới lớp, hoá đơn, giao dịch hay lương. */
export function registerStudentWriteTools(server: McpServer) {
  const fields = {
    fullName: z.string().trim().min(1).max(120).describe("Họ và tên học sinh"),
    phone: z.string().trim().describe("SĐT phụ huynh/học sinh (8–12 chữ số); dùng trong nội dung chuyển khoản"),
    address: z.string().trim().max(300).optional().describe("Địa chỉ"),
    parentName: z.string().trim().max(120).optional().describe("Tên phụ huynh"),
    note: z.string().trim().max(1000).optional().describe("Ghi chú")
  };

  server.registerTool(
    "create_student",
    {
      title: "Thêm học sinh",
      description:
        "Tạo hồ sơ học sinh mới (chưa vào lớp nào — ghi danh làm trong app). Chặn nếu trùng cả tên lẫn SĐT; cảnh báo nếu chỉ trùng SĐT. Có ghi nhật ký thay đổi.",
      inputSchema: fields,
      annotations: WRITE
    },
    guarded(async (input) => {
      const parsed = createStudentSchema.safeParse(input);
      if (!parsed.success) return fail(validationMessage(parsed.error));
      const data = parsed.data;

      const samePhone = await prisma.student.findMany({
        where: { phone: data.phone },
        select: { id: true, fullName: true, archivedAt: true },
        take: 20
      });
      const normalized = normalizeName(data.fullName);
      const duplicate = samePhone.find((student) => normalizeName(student.fullName) === normalized);
      if (duplicate) {
        return fail(
          duplicate.archivedAt
            ? `"${duplicate.fullName}" (${data.phone}) đã có trong hồ sơ lưu trữ (id ${duplicate.id}). Hãy dùng restore_student thay vì tạo mới.`
            : `"${duplicate.fullName}" (${data.phone}) đã tồn tại (id ${duplicate.id}). Không tạo thêm hồ sơ trùng.`
        );
      }

      const created = await runSerializable(
        async (tx) => {
          const student = await tx.student.create({
            data: {
              fullName: data.fullName,
              phone: data.phone,
              address: data.address,
              parentName: data.parentName,
              note: data.note
            }
          });
          await audit(tx, "student.created", student.id, null, { after: snapshot(student) });
          return student;
        },
        { onConflict: conflictError }
      );

      const siblings = samePhone.filter((student) => !student.archivedAt);
      return json({
        created: { id: created.id, fullName: created.fullName, phone: created.phone },
        warning: siblings.length
          ? `SĐT ${data.phone} đang dùng cho ${siblings.map((student) => student.fullName).join(", ")}. Nếu là anh chị em thì bình thường; học chung lớp thì memo hoá đơn của em sau tự có hậu tố B, C...`
          : null
      });
    })
  );

  server.registerTool(
    "update_student",
    {
      title: "Sửa hồ sơ học sinh",
      description:
        "Sửa một hay nhiều trường của hồ sơ (chỉ gửi trường cần đổi). Dùng để chữa tên gõ sai, SĐT sai định dạng... Chặn nếu sau khi sửa trùng cả tên lẫn SĐT với em khác. Không sửa được hồ sơ đã lưu trữ (restore trước). Lưu giá trị cũ vào nhật ký.",
      inputSchema: {
        studentId: studentIdSchema,
        fullName: fields.fullName.optional(),
        phone: fields.phone.optional(),
        address: fields.address,
        parentName: fields.parentName.describe("Tên phụ huynh; gửi chuỗi rỗng để xoá"),
        note: fields.note.describe("Ghi chú; gửi chuỗi rỗng để xoá"),
        reason: reasonSchema
      },
      annotations: { ...WRITE, idempotentHint: true }
    },
    guarded(async ({ studentId, reason, ...changes }) => {
      const supplied = Object.entries(changes).filter(([, value]) => value !== undefined);
      if (supplied.length === 0) return fail("Chưa có trường nào cần đổi.");

      const current = await prisma.student.findUnique({ where: { id: studentId } });
      if (!current) return fail("Không tìm thấy học sinh.");
      if (current.archivedAt) return fail("Học sinh đã lưu trữ. Hãy restore_student trước khi sửa.");

      const parsed = updateStudentSchema.safeParse({
        id: studentId,
        fullName: changes.fullName ?? current.fullName,
        phone: changes.phone ?? current.phone,
        address: changes.address ?? current.address,
        parentName: changes.parentName ?? current.parentName ?? undefined,
        note: changes.note ?? current.note ?? undefined
      });
      if (!parsed.success) return fail(validationMessage(parsed.error));
      const next = parsed.data;

      const clash = await prisma.student.findFirst({
        where: { phone: next.phone, id: { not: studentId } },
        select: { id: true, fullName: true, archivedAt: true }
      });
      if (clash && normalizeName(clash.fullName) === normalizeName(next.fullName)) {
        return fail(`Sau khi sửa sẽ trùng hồ sơ "${clash.fullName}" (id ${clash.id}, cùng tên và SĐT). Hãy xử lý hồ sơ trùng trước.`);
      }

      const before = snapshot(current);
      const updated = await runSerializable(
        async (tx) => {
          const changed = await tx.student.updateMany({
            where: { id: studentId, archivedAt: null },
            data: {
              fullName: next.fullName,
              phone: next.phone,
              address: next.address,
              parentName: next.parentName,
              note: next.note
            }
          });
          if (changed.count !== 1) throw new Error("Học sinh vừa được lưu trữ hoặc xoá. Hãy tải lại.");
          const fresh = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
          await audit(tx, "student.updated", studentId, reason, { before, after: snapshot(fresh) });
          return fresh;
        },
        { onConflict: conflictError }
      );

      const after = snapshot(updated);
      const diff = Object.fromEntries(
        (Object.keys(after) as Array<keyof typeof after>)
          .filter((key) => after[key] !== before[key])
          .map((key) => [key, { from: before[key], to: after[key] }])
      );
      return json({ updated: { id: updated.id, fullName: updated.fullName, phone: updated.phone }, changed: diff });
    })
  );

  for (const mode of ["archive", "restore"] as const) {
    server.registerTool(
      `${mode}_student`,
      {
        title: mode === "archive" ? "Lưu trữ học sinh" : "Khôi phục học sinh",
        description:
          mode === "archive"
            ? "Lưu trữ hồ sơ (ẩn khỏi danh sách đang học, KHÔNG xoá dữ liệu; hoá đơn và công nợ cũ vẫn giữ). Đây là cách an toàn để bỏ hồ sơ trùng/không dùng nữa. Khôi phục lại được bằng restore_student."
            : "Khôi phục hồ sơ học sinh đã lưu trữ về trạng thái hoạt động.",
        inputSchema: { studentId: studentIdSchema, reason: reasonSchema },
        annotations: { ...WRITE, idempotentHint: true }
      },
      guarded(async ({ studentId, reason }: { studentId: string; reason?: string }) => {
        const result = await runSerializable(
          async (tx) => {
            const current = await tx.student.findUnique({ where: { id: studentId } });
            if (!current) throw new Error("Không tìm thấy học sinh.");
            if (mode === "archive" && current.archivedAt) throw new Error("Học sinh đã được lưu trữ.");
            if (mode === "restore" && !current.archivedAt) throw new Error("Học sinh đang hoạt động.");

            const archivedAt = mode === "archive" ? new Date() : null;
            const changed = await tx.student.updateMany({
              where: { id: studentId, archivedAt: current.archivedAt },
              data: { archivedAt }
            });
            if (changed.count !== 1) throw new Error("Học sinh vừa được thay đổi. Vui lòng thử lại.");
            await audit(tx, mode === "archive" ? "student.archived" : "student.restored", studentId, reason, {
              previousArchivedAt: current.archivedAt?.toISOString() ?? null,
              archivedAt: archivedAt?.toISOString() ?? null
            });
            return { id: current.id, fullName: current.fullName, phone: current.phone, archived: Boolean(archivedAt) };
          },
          { onConflict: conflictError }
        );
        return json(result);
      })
    );
  }

  server.registerTool(
    "delete_student",
    {
      title: "Xoá học sinh",
      description:
        "XOÁ VĨNH VIỄN hồ sơ. Chỉ xoá được hồ sơ chưa từng ghi danh lớp nào (vd bản nhập lặp, chưa dính hoá đơn); hồ sơ đã có lịch sử học/hoá đơn sẽ bị từ chối — dùng archive_student cho trường hợp đó. Phải truyền confirm=true; toàn bộ dữ liệu hồ sơ được lưu vào nhật ký để dựng lại nếu xoá nhầm.",
      inputSchema: {
        studentId: studentIdSchema,
        confirm: z.literal(true).describe("Phải là true, xác nhận đã hỏi người dùng và họ đồng ý xoá"),
        reason: z.string().trim().min(3).max(500).describe("Lý do xoá (bắt buộc)")
      },
      annotations: DESTRUCTIVE
    },
    guarded(async ({ studentId, reason }) => {
      const result = await runSerializable(
        async (tx) => {
          const current = await tx.student.findUnique({
            where: { id: studentId },
            include: { _count: { select: { enrollments: true } } }
          });
          if (!current) throw new Error("Không tìm thấy học sinh.");
          if (current._count.enrollments > 0) {
            throw new Error(
              `"${current.fullName}" đã có ${current._count.enrollments} lượt ghi danh lớp (kèm hoá đơn/lịch sử) nên không được xoá. Hãy dùng archive_student để lưu trữ.`
            );
          }
          await tx.student.delete({ where: { id: studentId } });
          await audit(tx, "student.deleted", studentId, reason, {
            deleted: { ...snapshot(current), createdAt: current.createdAt.toISOString() }
          });
          return { id: current.id, fullName: current.fullName, phone: current.phone };
        },
        { onConflict: conflictError }
      );
      return json({ deleted: result });
    })
  );
}
