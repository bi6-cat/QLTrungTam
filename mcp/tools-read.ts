import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { absoluteUrl, payPath } from "@/lib/class-links";
import { getDashboard } from "@/lib/dashboard";
import {
  DEBT_SORTS,
  filterDebtRowsByPeriod,
  getOutstandingDebts,
  parseDebtPeriod,
  sortDebtRows,
  summarizeDebtPeriods,
  summarizeDebtRows
} from "@/lib/debts";
import { enrollmentVisibleInPeriodWhere } from "@/lib/enrollment-period";
import { getFinanceTrend, getMonthlyFinance } from "@/lib/finance";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { matchesName, sortByGivenName } from "@/lib/student-search";
import { clampLimit, guarded, fail, json, MCP_ACTOR, monthSchema, periodLabel, resolvePeriod, yearSchema } from "./util";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const classCodeSchema = z.string().trim().min(1).max(20).describe("Mã lớp viết tắt, VD L10A (không phân biệt hoa thường)");

export async function findClassByCode(code: string) {
  return prisma.classRoom.findUnique({ where: { shortCode: code.trim().toUpperCase() } });
}

export function registerReadTools(server: McpServer) {
  server.registerTool(
    "center_overview",
    {
      title: "Tổng quan trung tâm",
      description:
        "Bức tranh một tháng: tổng phải thu/đã thu/còn lại, tỷ lệ thu, công nợ tích luỹ mọi tháng, cảnh báo cần xử lý (giao dịch chưa khớp, lớp chưa có lịch, lương lệch) và số liệu từng lớp. Dùng đầu tiên khi hỏi 'hôm nay cần làm gì'.",
      inputSchema: { month: monthSchema, year: yearSchema },
      annotations: READ_ONLY
    },
    guarded(async ({ month, year }) => {
      const period = resolvePeriod(month, year);
      const data = await getDashboard(period.month, period.year);
      return json({
        ...data,
        classes: data.classes
          .filter((row) => !row.archivedAt || row.invoiceCount > 0)
          .map(({ archivedAt, ...row }) => ({ ...row, archived: Boolean(archivedAt) }))
      });
    })
  );

  server.registerTool(
    "list_classes",
    {
      title: "Danh sách lớp",
      description: "Các lớp: mã, tên, giáo viên, học phí/buổi, số buổi mặc định, % lương GV, lịch học, sĩ số đang học.",
      inputSchema: { includeArchived: z.boolean().optional().describe("Gồm cả lớp đã lưu trữ (mặc định: không)") },
      annotations: READ_ONLY
    },
    guarded(async ({ includeArchived }) => {
      const classes = await prisma.classRoom.findMany({
        where: includeArchived ? {} : { archivedAt: null },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          shortCode: true,
          teacherName: true,
          pricePerSession: true,
          sessionsPerMonthDefault: true,
          teacherSharePercent: true,
          archivedAt: true,
          schedules: {
            orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
            select: { weekday: true, startTime: true, endTime: true, room: true }
          },
          _count: { select: { enrollments: { where: { leftAt: null, status: "active" } } } }
        }
      });
      return json(
        classes.map(({ archivedAt, _count, ...row }) => ({
          ...row,
          archived: Boolean(archivedAt),
          activeStudents: _count.enrollments
        }))
      );
    })
  );

  server.registerTool(
    "get_class",
    {
      title: "Chi tiết lớp",
      description:
        "Một lớp: thông tin, lịch học, link nộp học phí của phụ huynh và danh sách học sinh kèm tình trạng hoá đơn của một tháng.",
      inputSchema: { classCode: classCodeSchema, month: monthSchema, year: yearSchema },
      annotations: READ_ONLY
    },
    guarded(async ({ classCode, month, year }) => {
      const classRoom = await findClassByCode(classCode);
      if (!classRoom) return fail(`Không có lớp mã "${classCode}".`);
      const period = resolvePeriod(month, year);
      const [schedules, enrollments, settings] = await Promise.all([
        prisma.classSchedule.findMany({
          where: { classId: classRoom.id },
          orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
          select: { weekday: true, startTime: true, endTime: true, room: true, note: true }
        }),
        prisma.enrollment.findMany({
          where: { classId: classRoom.id, ...enrollmentVisibleInPeriodWhere(period.month, period.year) },
          select: {
            id: true,
            status: true,
            startDate: true,
            leftAt: true,
            sessionsOverride: true,
            student: { select: { id: true, fullName: true, phone: true, parentName: true, archivedAt: true } },
            invoices: {
              where: { month: period.month, year: period.year },
              select: { status: true, amount: true, paidAmount: true, paidAt: true, sessions: true, memoContent: true }
            }
          }
        }),
        getAppSettings()
      ]);

      const students = sortByGivenName(
        enrollments.map((enrollment) => ({ ...enrollment, fullName: enrollment.student.fullName }))
      ).map((enrollment) => ({
        studentId: enrollment.student.id,
        fullName: enrollment.student.fullName,
        phone: enrollment.student.phone,
        parentName: enrollment.student.parentName,
        studentArchived: Boolean(enrollment.student.archivedAt),
        enrollmentStatus: enrollment.status,
        startDate: enrollment.startDate,
        leftAt: enrollment.leftAt,
        invoice: enrollment.invoices[0] ?? null
      }));

      return json({
        class: {
          id: classRoom.id,
          name: classRoom.name,
          shortCode: classRoom.shortCode,
          teacherName: classRoom.teacherName,
          pricePerSession: classRoom.pricePerSession,
          sessionsPerMonthDefault: classRoom.sessionsPerMonthDefault,
          teacherSharePercent: classRoom.teacherSharePercent,
          archived: Boolean(classRoom.archivedAt),
          payUrl: absoluteUrl(settings.appUrl, payPath(classRoom))
        },
        period: periodLabel(period.month, period.year),
        schedules,
        students
      });
    })
  );

  server.registerTool(
    "search_students",
    {
      title: "Tìm học sinh",
      description:
        "Tìm theo tên (gõ không dấu cũng được, mọi từ phải khớp) hoặc theo SĐT (chuỗi số). Trả về hồ sơ và các lớp đang học.",
      inputSchema: {
        query: z.string().trim().min(1).max(100).describe("Tên hoặc số điện thoại"),
        includeArchived: z.boolean().optional().describe("Gồm hồ sơ đã lưu trữ (mặc định: không)"),
        limit: z.number().int().min(1).max(100).optional().describe("Tối đa bao nhiêu kết quả (mặc định 20)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ query, includeArchived, limit }) => {
      const digits = query.replace(/\D/g, "");
      const isPhone = digits.length >= 4 && digits.length >= query.replace(/\s/g, "").length - 1;
      const students = await prisma.student.findMany({
        where: {
          ...(includeArchived ? {} : { archivedAt: null }),
          ...(isPhone ? { phone: { contains: digits } } : {})
        },
        select: {
          id: true,
          fullName: true,
          phone: true,
          parentName: true,
          address: true,
          note: true,
          archivedAt: true,
          enrollments: {
            where: { leftAt: null },
            select: { status: true, classRoom: { select: { shortCode: true, name: true } } }
          }
        }
      });
      const matched = isPhone ? students : students.filter((student) => matchesName(student.fullName, query));
      const max = clampLimit(limit, 20, 100);
      return json({
        total: matched.length,
        shown: Math.min(matched.length, max),
        students: sortByGivenName(matched)
          .slice(0, max)
          .map(({ archivedAt, enrollments, ...student }) => ({
            ...student,
            archived: Boolean(archivedAt),
            classes: enrollments.map((item) => ({ ...item.classRoom, status: item.status }))
          }))
      });
    })
  );

  server.registerTool(
    "get_student",
    {
      title: "Hồ sơ học sinh",
      description: "Một học sinh: thông tin, các lớp đã/đang học và 24 hoá đơn gần nhất kèm trạng thái, tổng nợ hiện tại.",
      inputSchema: { studentId: z.string().trim().min(1).max(64).describe("ID học sinh (lấy từ search_students)") },
      annotations: READ_ONLY
    },
    guarded(async ({ studentId }) => {
      const student = await prisma.student.findUnique({
        where: { id: studentId },
        include: {
          enrollments: {
            include: {
              classRoom: { select: { shortCode: true, name: true } },
              invoices: {
                orderBy: [{ year: "desc" }, { month: "desc" }],
                take: 24,
                select: {
                  month: true,
                  year: true,
                  amount: true,
                  paidAmount: true,
                  status: true,
                  statusReason: true,
                  paidAt: true,
                  memoContent: true
                }
              }
            }
          }
        }
      });
      if (!student) return fail("Không tìm thấy học sinh.");

      const invoices = student.enrollments
        .flatMap((enrollment) =>
          enrollment.invoices.map((invoice) => ({ class: enrollment.classRoom.shortCode, ...invoice }))
        )
        .sort((a, b) => b.year - a.year || b.month - a.month)
        .slice(0, 24);
      const outstanding = student.enrollments
        .flatMap((enrollment) => enrollment.invoices)
        .filter((invoice) => invoice.status === "unpaid")
        .reduce((sum, invoice) => sum + invoice.amount, 0);

      return json({
        id: student.id,
        fullName: student.fullName,
        phone: student.phone,
        parentName: student.parentName,
        address: student.address,
        note: student.note,
        archived: Boolean(student.archivedAt),
        createdAt: student.createdAt,
        outstandingAmount: outstanding,
        enrollments: student.enrollments.map((enrollment) => ({
          class: enrollment.classRoom.shortCode,
          className: enrollment.classRoom.name,
          status: enrollment.status,
          startDate: enrollment.startDate,
          leftAt: enrollment.leftAt
        })),
        recentInvoices: invoices
      });
    })
  );

  server.registerTool(
    "list_debts",
    {
      title: "Công nợ học phí",
      description:
        "Học sinh còn nợ học phí (hoá đơn chưa thu, cộng dồn mọi tháng): tổng quan, tổng nợ theo từng tháng và danh sách từng em. Lọc theo lớp, theo tháng nợ, theo số tháng quá hạn.",
      inputSchema: {
        classCode: classCodeSchema.optional(),
        period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Chỉ tính khoản nợ của tháng này, dạng "2026-09"'),
        minMonthsOverdue: z.number().int().min(0).max(36).optional().describe("Chỉ lấy em có khoản nợ quá hạn ≥ số tháng này (0 = nợ tháng hiện tại)"),
        sort: z.enum(DEBT_SORTS.map((item) => item.value) as [string, ...string[]]).optional().describe("oldest (mặc định) | newest | amount | name"),
        limit: z.number().int().min(1).max(200).optional().describe("Tối đa số em trả về (mặc định 50)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ classCode, period, minMonthsOverdue, sort, limit }) => {
      let classId: string | undefined;
      if (classCode) {
        const classRoom = await findClassByCode(classCode);
        if (!classRoom) return fail(`Không có lớp mã "${classCode}".`);
        classId = classRoom.id;
      }
      const settings = await getAppSettings();
      const all = await getOutstandingDebts({ classId, appUrl: settings.appUrl });
      let rows = all.rows;

      if (period) {
        const parsed = parseDebtPeriod(period);
        if (!parsed) return fail('Tháng phải có dạng "YYYY-MM", VD 2026-09.');
        rows = filterDebtRowsByPeriod(rows, parsed);
      }
      if (minMonthsOverdue !== undefined) {
        rows = rows.filter((row) => row.oldestOverdue >= minMonthsOverdue);
      }
      rows = sortDebtRows(rows, (sort as (typeof DEBT_SORTS)[number]["value"]) ?? "oldest");
      const max = clampLimit(limit, 50, 200);

      return json({
        summary: summarizeDebtRows(rows),
        byPeriod: summarizeDebtPeriods(all.rows),
        shown: Math.min(rows.length, max),
        students: rows.slice(0, max).map((row) => ({
          studentId: row.studentId,
          fullName: row.studentName,
          phone: row.phone,
          parentName: row.parentName,
          archived: row.studentArchived,
          classes: row.classes.map((item) => item.shortCode),
          totalAmount: row.totalAmount,
          oldestOverdueMonths: row.oldestOverdue,
          invoices: row.invoices.map((invoice) => ({
            period: periodLabel(invoice.month, invoice.year),
            class: invoice.classShortCode,
            amount: invoice.amount,
            monthsOverdue: invoice.monthsOverdue,
            memo: invoice.memoContent
          }))
        }))
      });
    })
  );

  server.registerTool(
    "list_transactions",
    {
      title: "Giao dịch",
      description:
        "Giao dịch tiền vào (SePay/tiền mặt). filter=unmatched: giao dịch chưa khớp hoá đơn nào, cần đối soát tay; filter=month: mọi giao dịch trong tháng. Chỉ xem, không gán hay hoàn tác được.",
      inputSchema: {
        filter: z.enum(["unmatched", "month"]).optional().describe("unmatched (mặc định) | month"),
        month: monthSchema,
        year: yearSchema,
        limit: z.number().int().min(1).max(100).optional().describe("Tối đa bao nhiêu giao dịch (mặc định 30)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ filter, month, year, limit }) => {
      const period = resolvePeriod(month, year);
      const where =
        filter === "month"
          ? { transferredAt: { gte: new Date(period.year, period.month - 1, 1), lt: new Date(period.year, period.month, 1) } }
          : { matchedInvoiceId: null, resolvedAt: null, reversedAt: null };
      const [total, transactions] = await Promise.all([
        prisma.transaction.count({ where }),
        prisma.transaction.findMany({
          where,
          orderBy: [{ transferredAt: "desc" }, { id: "desc" }],
          take: clampLimit(limit, 30, 100),
          select: {
            id: true,
            gatewayRef: true,
            amount: true,
            rawContent: true,
            transferredAt: true,
            paymentMethod: true,
            matchReason: true,
            reversedAt: true,
            resolvedAt: true,
            resolvedNote: true,
            matchedInvoice: {
              select: {
                month: true,
                year: true,
                amount: true,
                classShortCodeSnapshot: true,
                studentNameSnapshot: true
              }
            }
          }
        })
      ]);
      return json({ total, transactions });
    })
  );

  server.registerTool(
    "monthly_finance",
    {
      title: "Tài chính tháng",
      description:
        "Lãi/lỗ theo kỳ học phí của một tháng: đã thu, còn nợ, miễn, lương giáo viên phải trả/đã chuyển, chi phí khác, lợi nhuận, biên lợi nhuận theo lớp và dòng tiền thực nhận trong tháng (chuyển khoản vs tiền mặt).",
      inputSchema: { month: monthSchema, year: yearSchema },
      annotations: READ_ONLY
    },
    guarded(async ({ month, year }) => {
      const period = resolvePeriod(month, year);
      return json(await getMonthlyFinance(period.month, period.year));
    })
  );

  server.registerTool(
    "finance_trend",
    {
      title: "Xu hướng tài chính",
      description: "Doanh thu, lương GV, chi phí khác và lợi nhuận của N tháng gần nhất tính đến tháng chỉ định.",
      inputSchema: {
        month: monthSchema,
        year: yearSchema,
        count: z.number().int().min(2).max(24).optional().describe("Số tháng (mặc định 6)")
      },
      annotations: READ_ONLY
    },
    guarded(async ({ month, year, count }) => {
      const period = resolvePeriod(month, year);
      return json(await getFinanceTrend(period.month, period.year, count ?? 6));
    })
  );

  server.registerTool(
    "recent_mcp_changes",
    {
      title: "Thay đổi do Claude thực hiện",
      description: `Nhật ký các thay đổi MCP đã ghi vào hệ thống (tác nhân "${MCP_ACTOR}"), kèm dữ liệu trước/sau để hoàn tác thủ công khi cần.`,
      inputSchema: { limit: z.number().int().min(1).max(100).optional().describe("Mặc định 20") },
      annotations: READ_ONLY
    },
    guarded(async ({ limit }) => {
      const logs = await prisma.auditLog.findMany({
        where: { actorUsername: MCP_ACTOR },
        orderBy: { createdAt: "desc" },
        take: clampLimit(limit, 20, 100),
        select: { createdAt: true, action: true, entityType: true, entityId: true, reason: true, metadata: true }
      });
      return json(logs);
    })
  );
}
