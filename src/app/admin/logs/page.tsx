import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { History } from "lucide-react";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { Pagination } from "@/components/Pagination";
import { Badge, EmptyState, Field, Input, PageHeader, Panel, Select } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { actionPrefixesForGroup, AUDIT_ACTION_GROUPS, describeAudit } from "@/lib/audit-format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});

type SearchParams = {
  from?: string;
  to?: string;
  actor?: string;
  classId?: string;
  studentId?: string;
  group?: string;
  page?: string;
};

/** "YYYY-MM-DD" → 0h ngày đó theo giờ VN (máy chủ chạy TZ Asia/Ho_Chi_Minh). */
function parseDay(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function actorLabel(username: string) {
  if (username === "claude-mcp") return "Claude (MCP)";
  if (username.startsWith("system:")) return `Hệ thống (${username.slice(7)})`;
  return username;
}

// Chủ trung tâm và quản lý phụ đều xem được toàn bộ nhật ký.
export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireStaff();
  const params = await searchParams;
  const from = parseDay(params.from);
  const toDay = parseDay(params.to);
  const to = toDay ? new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate() + 1) : null;
  const prefixes = actionPrefixesForGroup(params.group);
  const requestedPage = Math.max(1, Math.floor(Number(params.page)) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(params.actor ? { actorUsername: params.actor } : {}),
    ...(params.classId ? { classId: params.classId } : {}),
    ...(params.studentId ? { studentId: params.studentId } : {}),
    ...(prefixes ? { OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })) } : {})
  };

  const [total, classes, actors, filterStudent] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.classRoom.findMany({ orderBy: [{ archivedAt: "asc" }, { name: "asc" }], select: { id: true, name: true, archivedAt: true } }),
    prisma.auditLog.findMany({ distinct: ["actorUsername"], select: { actorUsername: true }, orderBy: { actorUsername: "asc" } }),
    params.studentId
      ? prisma.student.findUnique({ where: { id: params.studentId }, select: { id: true, fullName: true } })
      : Promise.resolve(null)
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });

  const classNames = new Map(classes.map((item) => [item.id, item.name]));
  const studentIds = [...new Set(logs.map((log) => log.studentId).filter((id): id is string => Boolean(id)))];
  const students = studentIds.length
    ? await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true } })
    : [];
  const studentNames = new Map(students.map((item) => [item.id, item.fullName]));

  const hrefWith = (patch: Partial<SearchParams>) => {
    const query = new URLSearchParams();
    const merged = { ...params, ...patch };
    for (const [key, value] of Object.entries(merged)) if (value) query.set(key, String(value));
    const text = query.toString();
    return text ? `/admin/logs?${text}` : "/admin/logs";
  };

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Nhật ký thay đổi"
        description="Ai đã thêm, sửa, xóa gì trong hệ thống: học sinh, xếp lớp, số buổi, hóa đơn, lịch học, giao dịch."
      />

      <Panel className="grid gap-3">
        <AutoSubmitForm action="/admin/logs" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {params.studentId ? <input type="hidden" name="studentId" value={params.studentId} /> : null}
          <Field label="Từ ngày">
            <Input type="date" name="from" defaultValue={params.from ?? ""} />
          </Field>
          <Field label="Đến ngày">
            <Input type="date" name="to" defaultValue={params.to ?? ""} />
          </Field>
          <Field label="Người thực hiện">
            <Select name="actor" defaultValue={params.actor ?? ""}>
              <option value="">Tất cả</option>
              {actors.map((item) => (
                <option key={item.actorUsername} value={item.actorUsername}>
                  {actorLabel(item.actorUsername)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Lớp">
            <Select name="classId" defaultValue={params.classId ?? ""}>
              <option value="">Tất cả lớp</option>
              {classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.archivedAt ? " (đã lưu trữ)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Loại thao tác">
            <Select name="group" defaultValue={params.group ?? ""}>
              <option value="">Tất cả</option>
              {AUDIT_ACTION_GROUPS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
        </AutoSubmitForm>
        {filterStudent ? (
          <p className="text-sm text-stone-600">
            Đang xem riêng học sinh <strong>{filterStudent.fullName}</strong> ·{" "}
            <Link className="font-semibold text-primary hover:underline" href={hrefWith({ studentId: undefined, page: undefined })}>
              Bỏ lọc
            </Link>
          </p>
        ) : null}
      </Panel>

      {logs.length === 0 ? (
        <EmptyState title="Chưa có thay đổi nào" icon={<History className="h-6 w-6" />}>
          Không có dòng nhật ký nào khớp bộ lọc.
        </EmptyState>
      ) : (
        <Panel className="p-0">
          <ul className="divide-y divide-stone-100">
            {logs.map((log) => {
              const { title, details } = describeAudit(log);
              const className = log.classId ? classNames.get(log.classId) : undefined;
              const studentName = log.studentId ? studentNames.get(log.studentId) : undefined;
              return (
                <li key={log.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4 sm:px-5">
                  <div className="text-xs text-stone-500">
                    <p className="font-semibold text-stone-700">{timeFormatter.format(log.createdAt)}</p>
                    <p>{actorLabel(log.actorUsername)}</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-neutralText">{title}</span>
                      {className ? (
                        <Link href={hrefWith({ classId: log.classId ?? undefined, page: undefined })}>
                          <Badge tone="primary">{className}</Badge>
                        </Link>
                      ) : null}
                      {studentName && log.studentId ? (
                        <Link
                          className="text-sm font-semibold text-primary hover:underline"
                          href={`/admin/students/${log.studentId}`}
                        >
                          {studentName}
                        </Link>
                      ) : null}
                    </div>
                    {details.length > 0 ? (
                      <ul className="mt-1 grid gap-0.5 text-sm text-stone-600">
                        {details.map((line, index) => (
                          <li key={index} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-stone-100 px-4 py-3 sm:px-5">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              itemLabel="thay đổi"
              hrefFor={(target) => hrefWith({ page: String(target) })}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
