import Link from "next/link";
import type { AuditLog, Prisma } from "@prisma/client";
import { Bot, CalendarDays, History, KeyRound, ReceiptText, School, Server, UserPlus, UserRound, Wallet } from "lucide-react";
import { AutoSubmitForm } from "@/components/AutoSubmitForm";
import { Pagination } from "@/components/Pagination";
import { EmptyState, Input, PageHeader, Panel, Select } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import {
  actionPrefixesForGroup,
  AUDIT_ACTION_GROUPS,
  auditGroupOf,
  describeAudit,
  isDangerAction,
  type AuditChange
} from "@/lib/audit-format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

type SearchParams = {
  from?: string;
  to?: string;
  actor?: string;
  classId?: string;
  studentId?: string;
  group?: string;
  page?: string;
};

// Màu + icon từng nhóm. Viết class đầy đủ (không ghép chuỗi) để Tailwind giữ lại khi build.
const GROUP_STYLE: Record<string, { label: string; icon: typeof UserRound; pill: string; bar: string; dot: string }> = {
  students: { label: "Học sinh", icon: UserRound, pill: "bg-sky-50 text-sky-700 ring-sky-600/20", bar: "border-l-sky-400", dot: "bg-sky-500" },
  enrollments: {
    label: "Xếp lớp",
    icon: UserPlus,
    pill: "bg-violet-50 text-violet-700 ring-violet-600/20",
    bar: "border-l-violet-400",
    dot: "bg-violet-500"
  },
  sessions: {
    label: "Số buổi, HĐ",
    icon: ReceiptText,
    pill: "bg-amber-50 text-amber-800 ring-amber-600/25",
    bar: "border-l-amber-400",
    dot: "bg-amber-500"
  },
  classes: { label: "Lớp, lịch", icon: School, pill: "bg-teal-50 text-teal-700 ring-teal-600/20", bar: "border-l-teal-400", dot: "bg-teal-500" },
  money: {
    label: "Tiền",
    icon: Wallet,
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    bar: "border-l-emerald-400",
    dot: "bg-emerald-500"
  },
  accounts: { label: "Tài khoản", icon: KeyRound, pill: "bg-stone-100 text-stone-700 ring-stone-500/20", bar: "border-l-stone-400", dot: "bg-stone-500" },
  other: { label: "Khác", icon: CalendarDays, pill: "bg-stone-100 text-stone-600 ring-stone-500/20", bar: "border-l-stone-300", dot: "bg-stone-400" }
};

const ACTOR_STYLE = {
  owner: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  manager: "bg-sky-50 text-sky-700 ring-sky-600/20",
  claude: "bg-orange-50 text-orange-700 ring-orange-600/25",
  system: "bg-stone-100 text-stone-600 ring-stone-500/20"
} as const;

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh"
});
const yearFormatter = new Intl.DateTimeFormat("vi-VN", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });

/** "YYYY-MM-DD" → 0h ngày đó theo giờ VN (máy chủ chạy TZ Asia/Ho_Chi_Minh). */
function parseDay(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function actorOf(username: string, roles: Map<string, string>) {
  if (username === "claude-mcp") return { label: "Claude", style: ACTOR_STYLE.claude, icon: Bot };
  if (username.startsWith("system:")) return { label: username.slice(7) === "sepay" ? "SePay" : "Hệ thống", style: ACTOR_STYLE.system, icon: Server };
  const role = roles.get(username);
  return {
    label: role === "manager" ? `${username} · QL` : username,
    style: role === "manager" ? ACTOR_STYLE.manager : ACTOR_STYLE.owner,
    icon: UserRound
  };
}

function metaOf(log: AuditLog) {
  return log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
    ? (log.metadata as Record<string, unknown>)
    : {};
}

/** Một lần bấm Lưu số buổi cả lớp ghi nhiều dòng cùng batchId: gom các dòng liền nhau thành một. */
function groupBatches(logs: AuditLog[]) {
  const items: Array<{ head: AuditLog; rows: AuditLog[] }> = [];
  for (const log of logs) {
    const batchId = metaOf(log).batchId;
    const last = items[items.length - 1];
    if (
      typeof batchId === "string" &&
      last &&
      last.head.action === log.action &&
      metaOf(last.head).batchId === batchId
    ) {
      last.rows.push(log);
    } else {
      items.push({ head: log, rows: [log] });
    }
  }
  return items;
}

function ChangeList({ changes }: { changes: AuditChange[] }) {
  if (changes.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-0.5">
      {changes.map((change, index) => (
        <span key={index} className="whitespace-nowrap">
          <span className="text-stone-500">{change.label}</span>{" "}
          <span className="text-rose-600 line-through decoration-rose-300">{change.from}</span>
          <span className="px-1 text-stone-400">→</span>
          <span className="font-semibold text-emerald-700">{change.to}</span>
        </span>
      ))}
    </span>
  );
}

/** Thay đổi giống hệt nhau ở mọi dòng của một lô (vd cả lớp 8 → 7 buổi) thì hiện một lần. */
function commonChanges(descriptions: Array<{ changes: AuditChange[] }>) {
  const key = (changes: AuditChange[]) => JSON.stringify(changes);
  const first = key(descriptions[0].changes);
  return descriptions.every((item) => key(item.changes) === first) ? descriptions[0].changes : null;
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

  // Bộ lọc chung (trừ nhóm): dùng để đếm số dòng từng nhóm trên hàng nút.
  const baseWhere: Prisma.AuditLogWhereInput = {
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(params.actor ? { actorUsername: params.actor } : {}),
    ...(params.classId ? { classId: params.classId } : {}),
    ...(params.studentId ? { studentId: params.studentId } : {})
  };
  const where: Prisma.AuditLogWhereInput = {
    ...baseWhere,
    ...(prefixes ? { OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })) } : {})
  };

  const [total, classes, actors, admins, actionCounts, filterStudent] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.classRoom.findMany({ orderBy: [{ archivedAt: "asc" }, { name: "asc" }], select: { id: true, name: true, archivedAt: true } }),
    prisma.auditLog.findMany({ distinct: ["actorUsername"], select: { actorUsername: true }, orderBy: { actorUsername: "asc" } }),
    prisma.adminUser.findMany({ select: { username: true, role: true } }),
    prisma.auditLog.groupBy({ by: ["action"], where: baseWhere, _count: { _all: true } }),
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

  const roles = new Map(admins.map((admin) => [admin.username, admin.role]));
  const groupCounts = new Map<string, number>();
  let allCount = 0;
  for (const row of actionCounts) {
    const group = auditGroupOf(row.action);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + row._count._all);
    allCount += row._count._all;
  }

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

  const today = new Date();
  const thisYear = yearFormatter.format(today);
  const quickRanges = [
    { label: "Hôm nay", from: dayInput(today), to: dayInput(today) },
    { label: "7 ngày", from: dayInput(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), to: dayInput(today) },
    { label: "Tháng này", from: dayInput(new Date(today.getFullYear(), today.getMonth(), 1)), to: dayInput(today) }
  ];
  const formatTime = (date: Date) =>
    yearFormatter.format(date) === thisYear ? timeFormatter.format(date) : `${timeFormatter.format(date)} ${yearFormatter.format(date)}`;

  const chip = (active: boolean) =>
    `focus-ring inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 ring-inset transition-colors ${
      active ? "bg-primary text-white ring-primary" : "bg-white text-stone-700 ring-stone-200 hover:bg-stone-50"
    }`;

  const items = groupBatches(logs);

  return (
    <div className="grid gap-4">
      <PageHeader title="Nhật ký thay đổi" description="Ai đã thêm, sửa, xóa gì: học sinh, xếp lớp, số buổi, hóa đơn, lịch học, giao dịch." />

      <Panel className="grid gap-3 p-3 sm:p-4">
        {/* Hàng nút nhóm: bấm để lọc, số là số dòng khớp các bộ lọc còn lại. */}
        <div className="flex flex-wrap gap-1.5">
          <Link href={hrefWith({ group: undefined, page: undefined })} className={chip(!params.group)}>
            Tất cả <span className="opacity-70">{allCount}</span>
          </Link>
          {AUDIT_ACTION_GROUPS.map((group) => {
            const style = GROUP_STYLE[group.value];
            const active = params.group === group.value;
            return (
              <Link key={group.value} href={hrefWith({ group: group.value, page: undefined })} className={chip(active)}>
                <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                {group.label} <span className="opacity-70">{groupCounts.get(group.value) ?? 0}</span>
              </Link>
            );
          })}
        </div>

        <AutoSubmitForm action="/admin/logs" className="flex flex-wrap items-center gap-2 text-sm">
          {params.studentId ? <input type="hidden" name="studentId" value={params.studentId} /> : null}
          {params.group ? <input type="hidden" name="group" value={params.group} /> : null}
          <Input type="date" name="from" defaultValue={params.from ?? ""} className="h-9 w-auto" aria-label="Từ ngày" />
          <span className="text-stone-400">–</span>
          <Input type="date" name="to" defaultValue={params.to ?? ""} className="h-9 w-auto" aria-label="Đến ngày" />
          <Select name="actor" defaultValue={params.actor ?? ""} className="h-9 w-auto" aria-label="Người thực hiện">
            <option value="">Mọi người</option>
            {actors.map((item) => (
              <option key={item.actorUsername} value={item.actorUsername}>
                {actorOf(item.actorUsername, roles).label}
              </option>
            ))}
          </Select>
          <Select name="classId" defaultValue={params.classId ?? ""} className="h-9 w-auto max-w-56" aria-label="Lớp">
            <option value="">Mọi lớp</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archivedAt ? " (đã lưu trữ)" : ""}
              </option>
            ))}
          </Select>
          <span className="flex flex-wrap gap-1">
            {quickRanges.map((range) => (
              <Link
                key={range.label}
                href={hrefWith({ from: range.from, to: range.to, page: undefined })}
                className={chip(params.from === range.from && params.to === range.to)}
              >
                {range.label}
              </Link>
            ))}
          </span>
          {params.from || params.to || params.actor || params.classId ? (
            <Link
              href={hrefWith({ from: undefined, to: undefined, actor: undefined, classId: undefined, page: undefined })}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Bỏ lọc
            </Link>
          ) : null}
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
        <Panel className="overflow-hidden p-0">
          <ul className="divide-y divide-stone-100 text-sm">
            {items.map(({ head, rows }) => {
              const group = auditGroupOf(head.action);
              const style = GROUP_STYLE[group] ?? GROUP_STYLE.other;
              const Icon = style.icon;
              const danger = isDangerAction(head.action);
              const actor = actorOf(head.actorUsername, roles);
              const ActorIcon = actor.icon;
              const className = head.classId ? classNames.get(head.classId) : undefined;
              const descriptions = rows.map((row) => describeAudit(row));
              const description = descriptions[0];
              const isBatch = rows.length > 1;
              const shared = isBatch ? commonChanges(descriptions) : description.changes;
              const reason = descriptions.find((item) => item.reason)?.reason ?? null;
              const studentName = !isBatch && head.studentId ? studentNames.get(head.studentId) : undefined;

              return (
                <li
                  key={head.id}
                  className={`grid gap-x-3 gap-y-1 border-l-[3px] px-3 py-2 sm:grid-cols-[84px_118px_minmax(0,1fr)_auto] sm:items-start sm:px-4 ${
                    danger ? "border-l-rose-500 bg-rose-50/40" : style.bar
                  }`}
                >
                  {/* Điện thoại: giờ, nhóm, người làm chung một dòng; máy tính: mỗi thứ một cột. */}
                  <div className="flex items-center gap-2 sm:contents">
                    <span className="text-xs tabular-nums text-stone-500 sm:pt-0.5">{formatTime(head.createdAt)}</span>
                    <span className={`inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${style.pill}`}>
                      <Icon className="h-3 w-3" />
                      {style.label}
                    </span>
                    <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:hidden ${actor.style}`}>
                      <ActorIcon className="h-3 w-3" />
                      {actor.label}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={`font-semibold ${danger ? "text-rose-700" : "text-neutralText"}`}>{description.title}</span>
                      {className && head.classId ? (
                        <Link
                          href={hrefWith({ classId: head.classId, page: undefined })}
                          className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                        >
                          {className}
                        </Link>
                      ) : null}
                      {studentName && head.studentId ? (
                        <Link className="font-semibold text-primary hover:underline" href={`/admin/students/${head.studentId}`}>
                          {studentName}
                        </Link>
                      ) : null}
                      {isBatch ? <span className="text-xs font-semibold text-stone-600">{rows.length} học sinh</span> : null}
                      {description.summary.length > 0 ? (
                        <span className="text-stone-500">{description.summary.join(" · ")}</span>
                      ) : null}
                    </div>

                    {(shared && shared.length > 0) || reason ? (
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                        {shared ? <ChangeList changes={shared} /> : null}
                        {reason ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-900 ring-1 ring-inset ring-amber-200">
                            Lý do: {reason}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {isBatch ? (
                      <details className="mt-1 text-[13px]">
                        <summary className="cursor-pointer text-xs font-semibold text-primary">Xem từng em</summary>
                        <ul className="mt-1 grid gap-0.5 border-l border-stone-200 pl-3">
                          {rows.map((row, index) => (
                            <li key={row.id} className="flex flex-wrap gap-x-2">
                              {row.studentId ? (
                                <Link href={`/admin/students/${row.studentId}`} className="font-medium text-neutralText hover:underline">
                                  {studentNames.get(row.studentId) ?? String(metaOf(row).studentName ?? "?")}
                                </Link>
                              ) : (
                                <span>{String(metaOf(row).studentName ?? "?")}</span>
                              )}
                              {shared ? null : <ChangeList changes={descriptions[index].changes} />}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>

                  <span className={`hidden w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset sm:inline-flex sm:justify-self-end ${actor.style}`}>
                    <ActorIcon className="h-3 w-3" />
                    {actor.label}
                  </span>
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
