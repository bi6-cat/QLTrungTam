import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CENTER_INFO } from "@/lib/center";
import { absoluteUrl, payPath } from "@/lib/class-links";
import { buildReminderMessage, buildZaloLink, filterDebtRowsByPeriod, getOutstandingDebts, parseDebtPeriod } from "@/lib/debts";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/settings";
import { sortByGivenName } from "@/lib/student-search";
import { composeGroupDebtNotice, composeTuitionNotice, type NoticeDebtor, type TuitionPlan } from "./announcements";
import { findClassByCode } from "./tools-read";
import { fail, guarded, json, monthSchema, resolvePeriod, yearSchema } from "./util";

const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
const deadlineSchema = z.string().trim().max(100).optional().describe('Hạn đóng viết sẵn, VD "trước ngày 15/10"');
const extraNoteSchema = z.string().trim().max(500).optional().describe("Dòng ghi chú thêm cuối thông báo");

const HOW_TO_SEND = "Nội dung chỉ để chép và dán vào Zalo (MCP không gửi tin). Nếu có nhiều phần (parts), gửi lần lượt từng phần.";

/** Tool soạn nội dung Zalo: chỉ đọc dữ liệu, không gửi và không ghi gì. */
export function registerZaloTools(server: McpServer) {
  server.registerTool(
    "compose_group_debt_notice",
    {
      title: "Soạn thông báo nhắc nợ nhóm Zalo",
      description:
        "Soạn thông báo thu học phí gửi vào nhóm Zalo của lớp: danh sách học sinh còn nợ + link nộp học phí của lớp. Bỏ classCode để soạn một thông báo cho từng lớp đang có người nợ. LƯU Ý riêng tư: nhóm có nhiều phụ huynh, nên hỏi người dùng muốn hiện số tiền (names_amounts), chỉ hiện tên (names_only) hay chỉ số tổng (summary_only). " +
        HOW_TO_SEND,
      inputSchema: {
        classCode: z.string().trim().min(1).max(20).optional().describe("Mã lớp; bỏ trống = tất cả các lớp có nợ"),
        period: z.string().regex(/^\d{4}-\d{2}$/).optional().describe('Chỉ nhắc khoản nợ của tháng này, "2026-09"; bỏ trống = mọi tháng'),
        minMonthsOverdue: z.number().int().min(0).max(36).optional().describe("Chỉ nhắc khoản quá hạn ≥ số tháng này"),
        detail: z.enum(["names_amounts", "names_only", "summary_only"]).optional().describe("Mức chi tiết (mặc định names_amounts)"),
        deadline: deadlineSchema,
        extraNote: extraNoteSchema
      },
      annotations: READ_ONLY
    },
    guarded(async ({ classCode, period, minMonthsOverdue, detail, deadline, extraNote }) => {
      const parsedPeriod = period ? parseDebtPeriod(period) : null;
      if (period && !parsedPeriod) return fail('Tháng phải có dạng "YYYY-MM", VD 2026-09.');

      let onlyClass: Awaited<ReturnType<typeof findClassByCode>> = null;
      if (classCode) {
        onlyClass = await findClassByCode(classCode);
        if (!onlyClass) return fail(`Không có lớp mã "${classCode}".`);
      }

      const settings = await getAppSettings();
      const debts = await getOutstandingDebts({ classId: onlyClass?.id, appUrl: settings.appUrl });
      const rows = parsedPeriod ? filterDebtRowsByPeriod(debts.rows, parsedPeriod) : debts.rows;

      // Gom khoản nợ theo lớp (mã lớp ghi trên hoá đơn).
      const byClass = new Map<string, { name: string; debtors: Map<string, NoticeDebtor> }>();
      for (const row of rows) {
        for (const invoice of row.invoices) {
          if (minMonthsOverdue !== undefined && invoice.monthsOverdue < minMonthsOverdue) continue;
          const entry = byClass.get(invoice.classShortCode) ?? { name: invoice.className, debtors: new Map() };
          const debtor = entry.debtors.get(row.studentId) ?? {
            studentName: row.studentName,
            totalAmount: 0,
            invoices: []
          };
          debtor.totalAmount += invoice.amount;
          debtor.invoices.push({
            month: invoice.month,
            year: invoice.year,
            amount: invoice.amount,
            monthsOverdue: invoice.monthsOverdue
          });
          entry.debtors.set(row.studentId, debtor);
          byClass.set(invoice.classShortCode, entry);
        }
      }

      if (byClass.size === 0) {
        return json({ notices: [], note: "Không có khoản nợ nào khớp điều kiện — không cần gửi thông báo." });
      }

      const classes = await prisma.classRoom.findMany({
        where: { shortCode: { in: [...byClass.keys()] } },
        select: { shortCode: true, publicToken: true }
      });
      const classByCode = new Map(classes.map((item) => [item.shortCode, item]));

      const notices = [...byClass.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([shortCode, entry]) => {
          const classRoom = classByCode.get(shortCode);
          const debtors = sortByGivenName(
            [...entry.debtors.values()].map((debtor) => ({ ...debtor, fullName: debtor.studentName }))
          );
          const notice = composeGroupDebtNotice({
            centerName: CENTER_INFO.name,
            centerPhone: CENTER_INFO.phone,
            className: entry.name,
            classShortCode: shortCode,
            period: parsedPeriod,
            debtors,
            payUrl: classRoom ? absoluteUrl(settings.appUrl, payPath(classRoom)) : "",
            detail: detail ?? "names_amounts",
            deadline,
            extraNote
          });
          return { classCode: shortCode, className: entry.name, ...notice };
        });

      return json({ howToSend: HOW_TO_SEND, notices });
    })
  );

  server.registerTool(
    "compose_tuition_notice",
    {
      title: "Soạn thông báo học phí đầu tháng",
      description:
        "Soạn thông báo học phí của một tháng cho nhóm Zalo của lớp (số buổi, số tiền/em, hạn đóng, link nộp). Dựa trên hoá đơn đã tạo trong app; nếu lớp chưa có hoá đơn tháng đó sẽ cảnh báo. " +
        HOW_TO_SEND,
      inputSchema: {
        classCode: z.string().trim().min(1).max(20).describe("Mã lớp"),
        month: monthSchema,
        year: yearSchema,
        deadline: deadlineSchema,
        extraNote: extraNoteSchema
      },
      annotations: READ_ONLY
    },
    guarded(async ({ classCode, month, year, deadline, extraNote }) => {
      const classRoom = await findClassByCode(classCode);
      if (!classRoom) return fail(`Không có lớp mã "${classCode}".`);
      const period = resolvePeriod(month, year);

      const [invoices, settings] = await Promise.all([
        prisma.monthlyInvoice.findMany({
          where: {
            month: period.month,
            year: period.year,
            status: { in: ["paid", "unpaid"] },
            enrollment: { classId: classRoom.id }
          },
          select: { sessions: true, amount: true }
        }),
        getAppSettings()
      ]);

      const plans = new Map<string, TuitionPlan>();
      for (const invoice of invoices) {
        const key = `${invoice.sessions}:${invoice.amount}`;
        const plan = plans.get(key) ?? { sessions: invoice.sessions, amount: invoice.amount, students: 0 };
        plan.students += 1;
        plans.set(key, plan);
      }

      const notice = composeTuitionNotice({
        centerName: CENTER_INFO.name,
        centerPhone: CENTER_INFO.phone,
        className: classRoom.name,
        classShortCode: classRoom.shortCode,
        month: period.month,
        year: period.year,
        plans: [...plans.values()],
        payUrl: absoluteUrl(settings.appUrl, payPath(classRoom)),
        deadline,
        extraNote
      });
      return json({
        howToSend: HOW_TO_SEND,
        ...notice,
        warning: invoices.length === 0 ? "Lớp chưa có hoá đơn tháng này, hãy tạo hoá đơn trong app trước khi gửi." : null
      });
    })
  );

  server.registerTool(
    "compose_personal_reminder",
    {
      title: "Soạn tin nhắc nợ riêng",
      description:
        "Soạn tin nhắc nợ cho phụ huynh của MỘT học sinh, dùng đúng mẫu nhắc nợ đã cấu hình trong app (Cài đặt), gồm mọi khoản đang nợ và link nộp riêng của em. Trả kèm link mở chat Zalo theo SĐT. " +
        HOW_TO_SEND,
      inputSchema: { studentId: z.string().trim().min(1).max(64).describe("ID học sinh (lấy từ search_students hoặc list_debts)") },
      annotations: READ_ONLY
    },
    guarded(async ({ studentId }) => {
      const settings = await getAppSettings();
      const debts = await getOutstandingDebts({ appUrl: settings.appUrl });
      const row = debts.rows.find((item) => item.studentId === studentId);
      if (!row) return json({ message: null, note: "Học sinh này không có khoản nợ nào — không cần nhắc." });
      return json({
        howToSend: HOW_TO_SEND,
        studentName: row.studentName,
        phone: row.phone,
        totalAmount: row.totalAmount,
        zaloChatUrl: buildZaloLink(row.phone),
        message: buildReminderMessage(row, settings.debtReminderTemplate)
      });
    })
  );
}
