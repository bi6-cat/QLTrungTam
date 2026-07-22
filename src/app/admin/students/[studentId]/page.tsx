import Link from "next/link";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Banknote,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  GraduationCap,
  History,
  MapPin,
  Phone,
  ReceiptText,
  UserRound
} from "lucide-react";
import { ArchiveEntityButton } from "@/components/ArchiveEntityButton";
import { EditStudentButton } from "@/components/EditStudentButton";
import { Badge, EmptyState, Panel, PageHeader, StatCard } from "@/components/ui";
import { formatCurrency, formatEnrollmentStatus, formatMonth } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const TIMELINE_PAGE_SIZE = 40;
const MAX_RELATED_AUDIT_LOGS = 500;

const student360Include = Prisma.validator<Prisma.StudentInclude>()({
  enrollments: {
    orderBy: { createdAt: "desc" },
    include: {
      classRoom: true,
      months: {
        orderBy: [{ year: "desc" }, { month: "desc" }]
      },
      invoices: {
        orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }]
      }
    }
  }
});

type Student360 = Prisma.StudentGetPayload<{ include: typeof student360Include }>;
type StudentInvoice = Student360["enrollments"][number]["invoices"][number];
type RelatedTransaction = Prisma.TransactionGetPayload<Record<string, never>>;
type TimelineTone = "primary" | "success" | "warning" | "neutral";
type TimelineEvent = {
  key: string;
  at: Date;
  title: string;
  detail: string;
  tone: TimelineTone;
};

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Ho_Chi_Minh"
});

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeZone: "Asia/Ho_Chi_Minh"
});

function formatDateTime(value: Date) {
  return dateTimeFormatter.format(value);
}

function formatDate(value: Date) {
  return dateFormatter.format(value);
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, Prisma.JsonValue> | null {
  if (!value || Array.isArray(value) || typeof value !== "object") return null;
  return value as Record<string, Prisma.JsonValue>;
}

function invoiceIdFromJson(value: Prisma.JsonValue | null) {
  const invoiceId = jsonRecord(value)?.invoiceId;
  return typeof invoiceId === "string" ? invoiceId : null;
}

function invoiceStatusMeta(status: StudentInvoice["status"]): {
  label: string;
  tone: TimelineTone;
} {
  if (status === "paid") return { label: "Đã đóng", tone: "success" };
  if (status === "unpaid") return { label: "Chưa đóng", tone: "warning" };
  if (status === "waived") return { label: "Đã miễn", tone: "primary" };
  return { label: "Đã hủy", tone: "neutral" };
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    "student.archived": "Lưu trữ hồ sơ học sinh",
    "student.restored": "Khôi phục hồ sơ học sinh",
    "invoice.voided": "Hủy hóa đơn",
    "invoice.waived": "Miễn học phí",
    "invoice.restored": "Khôi phục hóa đơn về chưa đóng",
    "transaction.assigned": "Gán thủ công giao dịch vào hóa đơn",
    "transaction.unassigned": "Bỏ gán giao dịch khỏi hóa đơn",
    "transaction.resolved": "Đánh dấu giao dịch đã xử lý"
  };
  return labels[action] ?? action;
}

function auditTone(action: string): TimelineTone {
  if (action === "student.archived" || action === "invoice.voided") return "warning";
  if (action === "student.restored" || action === "invoice.restored") return "success";
  if (action === "invoice.waived") return "primary";
  return "neutral";
}

function transactionMethodLabel(method: RelatedTransaction["paymentMethod"]) {
  return method === "cash" ? "Tiền mặt" : "Chuyển khoản";
}

function timelineDotClass(tone: TimelineTone) {
  if (tone === "success") return "bg-emerald-500 ring-emerald-100";
  if (tone === "warning") return "bg-rose-500 ring-rose-100";
  if (tone === "primary") return "bg-indigo-500 ring-indigo-100";
  return "bg-stone-400 ring-stone-100";
}

export default async function Student360Page({
  params,
  searchParams
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ historyPage?: string }>;
}) {
  const { studentId } = await params;
  const query = await searchParams;
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: student360Include
  });

  if (!student) notFound();

  const invoiceRows = student.enrollments
    .flatMap((enrollment) =>
      enrollment.invoices.map((invoice) => ({ enrollment, invoice }))
    )
    .sort(
      (left, right) =>
        right.invoice.year - left.invoice.year ||
        right.invoice.month - left.invoice.month ||
        right.invoice.createdAt.getTime() - left.invoice.createdAt.getTime()
    );
  const invoices = invoiceRows.map((row) => row.invoice);
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const invoiceIdSet = new Set(invoiceIds);
  const invoiceRowById = new Map(invoiceRows.map((row) => [row.invoice.id, row]));
  const currentTransactionIds = invoices
    .map((invoice) => invoice.transactionId)
    .filter((id): id is string => Boolean(id));

  const initialAuditFilters: Prisma.AuditLogWhereInput[] = [
    { entityType: "Student", entityId: student.id },
    ...(invoiceIds.length > 0
      ? [{ entityType: "MonthlyInvoice", entityId: { in: invoiceIds } }]
      : []),
    ...invoiceIds.map(
      (invoiceId): Prisma.AuditLogWhereInput => ({
        entityType: "Transaction",
        metadata: { path: ["invoiceId"], equals: invoiceId }
      })
    ),
    ...(currentTransactionIds.length > 0
      ? [{ entityType: "Transaction", entityId: { in: currentTransactionIds } }]
      : [])
  ];

  const initialAuditLogs = await prisma.auditLog.findMany({
    where: { OR: initialAuditFilters },
    orderBy: { createdAt: "desc" },
    take: MAX_RELATED_AUDIT_LOGS
  });
  const auditedTransactionIds = initialAuditLogs
    .filter((log) => log.entityType === "Transaction")
    .map((log) => log.entityId);

  const transactionFilters: Prisma.TransactionWhereInput[] = [
    ...(invoiceIds.length > 0 ? [{ matchedInvoiceId: { in: invoiceIds } }] : []),
    ...(currentTransactionIds.length > 0 ? [{ id: { in: currentTransactionIds } }] : []),
    ...(auditedTransactionIds.length > 0 ? [{ id: { in: auditedTransactionIds } }] : []),
    ...invoiceIds.map(
      (invoiceId): Prisma.TransactionWhereInput => ({
        rawPayload: { path: ["invoiceId"], equals: invoiceId }
      })
    )
  ];

  const transactions = transactionFilters.length
    ? await prisma.transaction.findMany({
        where: { OR: transactionFilters },
        orderBy: [{ transferredAt: "desc" }, { id: "desc" }]
      })
    : [];

  const transactionIds = transactions.map((transaction) => transaction.id);
  const remainingTransactionAuditLogs = transactionIds.length
      ? await prisma.auditLog.findMany({
        where: {
          entityType: "Transaction",
          entityId: { in: transactionIds },
          id: { notIn: initialAuditLogs.map((log) => log.id) }
        },
        orderBy: { createdAt: "desc" },
        take: MAX_RELATED_AUDIT_LOGS
      })
    : [];
  const auditLogs = [...initialAuditLogs, ...remainingTransactionAuditLogs];
  const auditHistoryMayBeTruncated =
    initialAuditLogs.length >= MAX_RELATED_AUDIT_LOGS ||
    remainingTransactionAuditLogs.length >= MAX_RELATED_AUDIT_LOGS;

  const currentInvoiceByTransactionId = new Map(
    invoices
      .filter((invoice): invoice is StudentInvoice & { transactionId: string } =>
        Boolean(invoice.transactionId)
      )
      .map((invoice) => [invoice.transactionId, invoice.id])
  );
  const invoiceIdsByTransactionId = new Map<string, Set<string>>();
  const associateTransaction = (transactionId: string, invoiceId: string | null) => {
    if (!invoiceId || !invoiceIdSet.has(invoiceId)) return;
    const related = invoiceIdsByTransactionId.get(transactionId) ?? new Set<string>();
    related.add(invoiceId);
    invoiceIdsByTransactionId.set(transactionId, related);
  };

  for (const transaction of transactions) {
    associateTransaction(transaction.id, transaction.matchedInvoiceId);
    associateTransaction(transaction.id, currentInvoiceByTransactionId.get(transaction.id) ?? null);
    associateTransaction(transaction.id, invoiceIdFromJson(transaction.rawPayload));
  }
  for (const log of auditLogs) {
    if (log.entityType === "Transaction") {
      associateTransaction(log.entityId, invoiceIdFromJson(log.metadata));
    }
  }

  const transactionsByInvoiceId = new Map<string, RelatedTransaction[]>();
  for (const transaction of transactions) {
    for (const invoiceId of invoiceIdsByTransactionId.get(transaction.id) ?? []) {
      const related = transactionsByInvoiceId.get(invoiceId) ?? [];
      related.push(transaction);
      transactionsByInvoiceId.set(invoiceId, related);
    }
  }

  const monthRows = student.enrollments
    .flatMap((enrollment) =>
      enrollment.months.map((month) => ({ enrollment, month }))
    )
    .sort(
      (left, right) =>
        right.month.year - left.month.year ||
        right.month.month - left.month.month ||
        right.month.updatedAt.getTime() - left.month.updatedAt.getTime()
    );

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentStatusByEnrollmentId = new Map(
    student.enrollments.map((enrollment) => {
      const currentPeriod = enrollment.months.find(
        (month) => month.month === currentMonth && month.year === currentYear
      );
      return [enrollment.id, currentPeriod?.status ?? enrollment.status] as const;
    })
  );

  const paidAmount = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const unpaidAmount = invoices
    .filter((invoice) => invoice.status === "unpaid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const activeEnrollmentCount = student.archivedAt
    ? 0
    : student.enrollments.filter(
        (enrollment) =>
          currentStatusByEnrollmentId.get(enrollment.id) === "active" &&
          !enrollment.classRoom.archivedAt
      ).length;
  const closedInvoiceCount = invoices.filter(
    (invoice) => invoice.status === "waived" || invoice.status === "void"
  ).length;

  const invoiceLabel = (invoiceId: string) => {
    const row = invoiceRowById.get(invoiceId);
    if (!row) return `Hóa đơn ${invoiceId}`;
    const classCode = row.invoice.classShortCodeSnapshot ?? row.enrollment.classRoom.shortCode;
    return `${classCode} · ${formatMonth(row.invoice.month, row.invoice.year)}`;
  };

  const timeline: TimelineEvent[] = [
    {
      key: `student-created-${student.id}`,
      at: student.createdAt,
      title: "Tạo hồ sơ học sinh",
      detail: `${student.fullName} · ${student.phone}`,
      tone: "primary"
    },
    ...student.enrollments.map(
      (enrollment): TimelineEvent => ({
        key: `enrollment-created-${enrollment.id}`,
        at: enrollment.createdAt,
        title: `Ghi danh vào ${enrollment.classRoom.name}`,
        detail: `${enrollment.classRoom.shortCode} · ${formatEnrollmentStatus(enrollment.status)}`,
        tone: "primary"
      })
    ),
    ...invoiceRows.map(
      ({ enrollment, invoice }): TimelineEvent => ({
        key: `invoice-created-${invoice.id}`,
        at: invoice.createdAt,
        title: `Phát hành hóa đơn ${formatMonth(invoice.month, invoice.year)}`,
        detail: `${invoice.classShortCodeSnapshot ?? enrollment.classRoom.shortCode} · ${formatCurrency(invoice.amount)} · ${invoice.memoContent}`,
        tone: "neutral"
      })
    ),
    ...transactions.flatMap((transaction): TimelineEvent[] => {
      const relatedLabels = Array.from(invoiceIdsByTransactionId.get(transaction.id) ?? []).map(invoiceLabel);
      const association = relatedLabels.length ? relatedLabels.join("; ") : "Giao dịch liên quan hồ sơ";
      const events: TimelineEvent[] = [
        {
          key: `transaction-received-${transaction.id}`,
          at: transaction.transferredAt,
          title: `Nhận ${transactionMethodLabel(transaction.paymentMethod).toLowerCase()}`,
          detail: `${formatCurrency(transaction.amount)} · ${association} · Mã ${transaction.gatewayRef}${transaction.reversedAt ? " · sau đó đã hoàn tác" : ""}`,
          tone: transaction.reversedAt ? "neutral" : "success"
        }
      ];
      if (transaction.reversedAt) {
        events.push({
          key: `transaction-reversed-${transaction.id}`,
          at: transaction.reversedAt,
          title: "Hoàn tác giao dịch",
          detail: `${formatCurrency(transaction.amount)} · ${association}${transaction.reversalReason ? ` · ${transaction.reversalReason}` : ""}`,
          tone: "warning"
        });
      }
      return events;
    })
  ];

  const auditedLifecycleInvoiceIds = new Set<string>();
  for (const log of auditLogs) {
    if (log.entityType === "MonthlyInvoice") auditedLifecycleInvoiceIds.add(log.entityId);

    const isSupportedAudit =
      log.entityType === "Student" ||
      log.entityType === "MonthlyInvoice" ||
      (log.entityType === "Transaction" &&
        ["transaction.assigned", "transaction.unassigned", "transaction.resolved"].includes(log.action));
    if (!isSupportedAudit) continue;

    const relatedInvoiceId =
      log.entityType === "MonthlyInvoice" ? log.entityId : invoiceIdFromJson(log.metadata);
    const relatedInvoice = relatedInvoiceId && invoiceIdSet.has(relatedInvoiceId)
      ? ` · ${invoiceLabel(relatedInvoiceId)}`
      : "";
    timeline.push({
      key: `audit-${log.id}`,
      at: log.createdAt,
      title: auditActionLabel(log.action),
      detail: `${log.reason || "Không có ghi chú"}${relatedInvoice} · bởi ${log.actorUsername}`,
      tone: auditTone(log.action)
    });
  }

  for (const invoice of invoices) {
    if (
      invoice.statusChangedAt &&
      !auditedLifecycleInvoiceIds.has(invoice.id) &&
      (invoice.status === "void" || invoice.status === "waived")
    ) {
      timeline.push({
        key: `invoice-status-${invoice.id}`,
        at: invoice.statusChangedAt,
        title: invoice.status === "void" ? "Hủy hóa đơn" : "Miễn học phí",
        detail: `${invoiceLabel(invoice.id)} · ${invoice.statusReason || "Không có ghi chú"}`,
        tone: invoice.status === "void" ? "warning" : "primary"
      });
    }
  }
  timeline.sort((left, right) => right.at.getTime() - left.at.getTime());
  const parsedHistoryPage = Number(query.historyPage);
  const requestedHistoryPage =
    Number.isSafeInteger(parsedHistoryPage) && parsedHistoryPage >= 1 ? parsedHistoryPage : 1;
  const historyPageCount = Math.max(1, Math.ceil(timeline.length / TIMELINE_PAGE_SIZE));
  const historyPage = Math.min(requestedHistoryPage, historyPageCount);
  const visibleTimeline = timeline.slice(
    (historyPage - 1) * TIMELINE_PAGE_SIZE,
    historyPage * TIMELINE_PAGE_SIZE
  );

  return (
    <div className="grid gap-6">
      <PageHeader
        title={student.fullName}
        description="Hồ sơ 360°: quá trình học, hóa đơn, thanh toán và các thay đổi quan trọng."
        actions={
          <>
            <Link
              href={student.archivedAt ? "/admin/students?archived=1" : "/admin/students"}
              className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-stone-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Danh sách học sinh
            </Link>
            {!student.archivedAt ? (
              <EditStudentButton
                student={{
                  id: student.id,
                  fullName: student.fullName,
                  phone: student.phone,
                  address: student.address,
                  parentName: student.parentName,
                  note: student.note
                }}
              />
            ) : null}
            <ArchiveEntityButton
              kind="student"
              entityId={student.id}
              entityName={student.fullName}
              archived={Boolean(student.archivedAt)}
            />
          </>
        }
      />

      {student.archivedAt ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-300 bg-stone-100 px-5 py-4 text-sm text-stone-700">
          <Archive className="h-5 w-5" />
          <strong>Hồ sơ đã lưu trữ</strong>
          <span>từ {formatDateTime(student.archivedAt)}. Dữ liệu học phí và thanh toán vẫn được giữ nguyên.</span>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Thông tin học sinh</h2>
            </div>
            <Badge tone={student.archivedAt ? "neutral" : "success"} dot>
              {student.archivedAt ? "Đã lưu trữ" : "Đang hoạt động"}
            </Badge>
          </div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-400">Họ tên</dt>
              <dd className="mt-1 font-semibold text-neutralText">{student.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-400">Phụ huynh</dt>
              <dd className="mt-1 font-semibold text-neutralText">{student.parentName || "Chưa cập nhật"}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                <Phone className="h-3.5 w-3.5" /> Số điện thoại
              </dt>
              <dd className="mt-1">
                <a className="font-mono font-semibold text-primary hover:underline" href={`tel:${student.phone}`}>
                  {student.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-stone-400">
                <MapPin className="h-3.5 w-3.5" /> Địa chỉ
              </dt>
              <dd className="mt-1 text-stone-700">{student.address || "Chưa cập nhật"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase tracking-wide text-stone-400">Ghi chú</dt>
              <dd className="mt-1 whitespace-pre-wrap text-stone-700">{student.note || "Không có ghi chú"}</dd>
            </div>
          </dl>
          <p className="mt-5 border-t border-stone-100 pt-4 text-xs text-stone-500">
            Tạo hồ sơ ngày {formatDate(student.createdAt)} · Mã hồ sơ <span className="font-mono">{student.id}</span>
          </p>
        </Panel>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Lớp đang học"
            value={activeEnrollmentCount}
            hint={`${student.enrollments.length} ghi danh trong lịch sử`}
            icon={<GraduationCap className="h-5 w-5" />}
            tone="primary"
          />
          <StatCard
            label="Đã đóng"
            value={formatCurrency(paidAmount)}
            hint={`${invoices.filter((invoice) => invoice.status === "paid").length} hóa đơn`}
            icon={<CheckCircle2 className="h-5 w-5" />}
            tone="success"
          />
          <StatCard
            label="Còn phải thu"
            value={formatCurrency(unpaidAmount)}
            hint={`${invoices.filter((invoice) => invoice.status === "unpaid").length} hóa đơn chưa đóng`}
            icon={<Clock className="h-5 w-5" />}
            tone={unpaidAmount > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Miễn / hủy"
            value={closedInvoiceCount}
            hint={`${invoices.filter((invoice) => invoice.status === "waived").length} miễn · ${invoices.filter((invoice) => invoice.status === "void").length} hủy`}
            icon={<FileText className="h-5 w-5" />}
            tone="neutral"
          />
        </div>
      </div>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lớp và ghi danh</h2>
        </div>
        {student.enrollments.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa ghi danh lớp nào" icon={<GraduationCap className="h-6 w-6" />}>
              Khi học sinh được thêm vào lớp, thông tin sẽ xuất hiện tại đây.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Giáo viên</th>
                  <th className="px-4 py-3">Trạng thái hiện tại</th>
                  <th className="px-4 py-3">Số buổi mặc định</th>
                  <th className="px-4 py-3">Ngày ghi danh</th>
                  <th className="px-4 py-3">Lịch sử</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {student.enrollments.map((enrollment) => {
                  const currentPeriod = enrollment.months.find(
                    (month) => month.month === currentMonth && month.year === currentYear
                  );
                  const currentStatus = currentStatusByEnrollmentId.get(enrollment.id) ?? enrollment.status;
                  return <tr key={enrollment.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{enrollment.classRoom.name}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone="primary">{enrollment.classRoom.shortCode}</Badge>
                        {enrollment.classRoom.archivedAt ? <Badge tone="neutral">Lớp đã lưu trữ</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{enrollment.classRoom.teacherName || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={currentStatus === "active" && !student.archivedAt && !enrollment.classRoom.archivedAt ? "success" : "neutral"} dot>
                        {formatEnrollmentStatus(currentStatus)}
                      </Badge>
                      <p className="mt-1 text-xs text-stone-500">
                        {currentPeriod ? `Theo ${formatMonth(currentMonth, currentYear)}` : "Chưa khởi tạo tháng · dùng thiết lập chung"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">
                        {enrollment.sessionsOverride ?? enrollment.classRoom.sessionsPerMonthDefault} buổi
                      </span>
                      {enrollment.sessionsOverride != null ? (
                        <p className="mt-1 text-xs text-stone-500">Có thiết lập riêng</p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(enrollment.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-600">
                      {enrollment.months.length} tháng · {enrollment.invoices.length} hóa đơn
                    </td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Kế hoạch học theo tháng</h2>
          <Badge>{monthRows.length} kỳ</Badge>
        </div>
        {monthRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có kế hoạch tháng" icon={<CalendarDays className="h-6 w-6" />}>
              Dữ liệu số buổi và trạng thái từng tháng sẽ hiển thị tại đây.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Kỳ</th>
                  <th className="px-4 py-3">Lớp</th>
                  <th className="px-4 py-3">Trạng thái học</th>
                  <th className="px-4 py-3">Số buổi</th>
                  <th className="px-4 py-3">Đơn giá</th>
                  <th className="px-4 py-3">Giá trị kế hoạch</th>
                  <th className="px-4 py-3">Cập nhật</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {monthRows.map(({ enrollment, month }) => (
                  <tr key={month.id} className="transition-colors hover:bg-indigo-50/40">
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatMonth(month.month, month.year)}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold">{enrollment.classRoom.shortCode}</div>
                      <div className="text-xs text-stone-500">{enrollment.classRoom.name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={month.status === "active" ? "primary" : "neutral"}>
                        {formatEnrollmentStatus(month.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-semibold">{month.sessions}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatCurrency(month.pricePerSession)}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-primary">
                      {month.status === "active" ? formatCurrency(month.sessions * month.pricePerSession) : "Không thu"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-stone-500">{formatDateTime(month.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 px-5 py-4">
          <ReceiptText className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Lịch sử hóa đơn</h2>
          <Badge>{invoices.length} hóa đơn</Badge>
          <span className="text-xs text-stone-500">Thông tin snapshot giữ nguyên theo thời điểm phát hành.</span>
        </div>
        {invoiceRows.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa phát hành hóa đơn" icon={<ReceiptText className="h-6 w-6" />}>
              Hồ sơ này chưa có khoản học phí đã phát hành.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Kỳ</th>
                  <th className="px-4 py-3">Snapshot khi phát hành</th>
                  <th className="px-4 py-3">Số buổi × đơn giá</th>
                  <th className="px-4 py-3">Số tiền / memo</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Thanh toán liên quan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {invoiceRows.map(({ enrollment, invoice }) => {
                  const status = invoiceStatusMeta(invoice.status);
                  const relatedTransactions = transactionsByInvoiceId.get(invoice.id) ?? [];
                  return (
                    <tr key={invoice.id} className="align-top transition-colors hover:bg-indigo-50/40">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold">{formatMonth(invoice.month, invoice.year)}</div>
                        <div className="mt-1 text-xs text-stone-500">Phát hành {formatDateTime(invoice.createdAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">
                          {invoice.studentNameSnapshot ?? student.fullName}
                          <span className="ml-2 font-mono text-xs font-normal text-stone-500">
                            {invoice.studentPhoneSnapshot ?? student.phone}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          {invoice.classNameSnapshot ?? enrollment.classRoom.name} · {invoice.classShortCodeSnapshot ?? enrollment.classRoom.shortCode}
                        </div>
                        <div className="mt-1 text-xs text-stone-500">
                          GV: {(invoice.teacherNameSnapshot ?? enrollment.classRoom.teacherName) || "Chưa ghi nhận"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-semibold">{invoice.sessions} buổi</div>
                        <div className="mt-1 text-xs text-stone-500">× {formatCurrency(invoice.pricePerSession)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="whitespace-nowrap font-semibold text-primary">{formatCurrency(invoice.amount)}</div>
                        <code className="mt-2 inline-block max-w-[280px] break-all rounded bg-stone-100 px-2 py-1 text-xs">
                          {invoice.memoContent}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={status.tone} dot>{status.label}</Badge>
                        {invoice.paidAt ? <p className="mt-2 text-xs text-stone-500">Đóng {formatDateTime(invoice.paidAt)}</p> : null}
                        {invoice.statusReason ? <p className="mt-2 max-w-xs text-xs text-stone-600">{invoice.statusReason}</p> : null}
                        {invoice.statusChangedAt ? <p className="mt-1 text-xs text-stone-400">Đổi trạng thái {formatDateTime(invoice.statusChangedAt)}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        {relatedTransactions.length === 0 ? (
                          <span className="text-stone-400">-</span>
                        ) : (
                          <div className="grid gap-2">
                            {relatedTransactions.map((transaction) => (
                              <div key={transaction.id} className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                  <strong>{transactionMethodLabel(transaction.paymentMethod)}</strong>
                                  <span>{formatCurrency(transaction.amount)}</span>
                                  {transaction.reversedAt ? <Badge tone="warning">Đã hoàn tác</Badge> : null}
                                </div>
                                <div className="mt-1 font-mono text-stone-500">{transaction.gatewayRef}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-stone-100 px-5 py-4">
          <Banknote className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Giao dịch thanh toán</h2>
          <Badge>{transactions.length} giao dịch</Badge>
        </div>
        {transactions.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Chưa có giao dịch liên quan" icon={<Banknote className="h-6 w-6" />}>
              Giao dịch sẽ xuất hiện khi hóa đơn được thanh toán hoặc từng được gán thủ công.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-stone-50/80 text-xs font-semibold uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Phương thức / mã GD</th>
                  <th className="px-4 py-3">Số tiền</th>
                  <th className="px-4 py-3">Hóa đơn liên quan</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3">Nội dung / ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {transactions.map((transaction) => {
                  const relatedInvoiceIds = Array.from(invoiceIdsByTransactionId.get(transaction.id) ?? []);
                  const currentlyMatchedToStudent = Boolean(
                    transaction.matchedInvoiceId && invoiceIdSet.has(transaction.matchedInvoiceId)
                  );
                  const movedToAnotherInvoice = Boolean(
                    transaction.matchedInvoiceId && !invoiceIdSet.has(transaction.matchedInvoiceId)
                  );
                  const state = transaction.reversedAt
                    ? { label: "Đã hoàn tác", tone: "warning" as const }
                    : currentlyMatchedToStudent
                      ? { label: "Đã khớp", tone: "success" as const }
                      : movedToAnotherInvoice
                        ? { label: "Đã chuyển hóa đơn", tone: "neutral" as const }
                        : transaction.resolvedAt
                          ? { label: "Đã xử lý", tone: "neutral" as const }
                          : { label: "Đã bỏ gán", tone: "neutral" as const };
                  return (
                    <tr key={transaction.id} className="align-top transition-colors hover:bg-indigo-50/40">
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(transaction.transferredAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={transaction.paymentMethod === "cash" ? "neutral" : "primary"}>
                          {transactionMethodLabel(transaction.paymentMethod)}
                        </Badge>
                        <div className="mt-2 font-mono text-xs text-stone-500">{transaction.gatewayRef}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold">{formatCurrency(transaction.amount)}</td>
                      <td className="px-4 py-3">
                        {relatedInvoiceIds.length ? (
                          <div className="grid gap-1">
                            {relatedInvoiceIds.map((invoiceId) => (
                              <span key={invoiceId} className="font-medium">{invoiceLabel(invoiceId)}</span>
                            ))}
                          </div>
                        ) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={state.tone} dot>{state.label}</Badge>
                        {transaction.matchedAt ? <p className="mt-2 text-xs text-stone-500">Khớp {formatDateTime(transaction.matchedAt)}</p> : null}
                        {transaction.reversedAt ? <p className="mt-2 text-xs text-rose-700">{formatDateTime(transaction.reversedAt)} · {transaction.reversalReason || "Không có lý do"}</p> : null}
                        {!transaction.reversedAt && transaction.resolvedAt ? <p className="mt-2 text-xs text-stone-500">{transaction.resolvedNote || "Đã xử lý"}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-sm break-words font-mono text-xs">{transaction.rawContent}</p>
                        {transaction.matchOverrideReason ? <p className="mt-2 max-w-sm text-xs text-amber-700">Gán lệch: {transaction.matchOverrideReason}</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <div id="timeline" className="scroll-mt-24" />
        <div className="flex flex-wrap items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="font-bold">Dòng thời gian hồ sơ</h2>
          <Badge>{timeline.length} hoạt động</Badge>
        </div>
        <p className="mt-1 text-xs text-stone-500">
          Gộp lịch sử ghi danh, hóa đơn, thanh toán, hoàn tác và lưu trữ · trang {historyPage}/{historyPageCount}.
        </p>
        {auditHistoryMayBeTruncated ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
            Hồ sơ có lịch sử audit rất dài; màn hình đang giới hạn các bản ghi audit gần nhất. Dữ liệu gốc vẫn được giữ nguyên trong hệ thống.
          </p>
        ) : null}
        <div className="mt-5 max-h-[48rem] overflow-y-auto pr-2">
          <ol className="relative ml-2 border-l border-stone-200">
            {visibleTimeline.map((event) => (
              <li key={event.key} className="relative ml-6 pb-6 last:pb-0">
                <span className={`absolute -left-[31px] top-1 h-3 w-3 rounded-full ring-4 ${timelineDotClass(event.tone)}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutralText">{event.title}</h3>
                  <time className="whitespace-nowrap text-xs text-stone-400">{formatDateTime(event.at)}</time>
                </div>
                <p className="mt-1 text-sm text-stone-600">{event.detail}</p>
              </li>
            ))}
          </ol>
        </div>
        {historyPageCount > 1 ? (
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-500">
              Hiển thị {(historyPage - 1) * TIMELINE_PAGE_SIZE + 1}-
              {Math.min(historyPage * TIMELINE_PAGE_SIZE, timeline.length)} / {timeline.length}
            </p>
            <div className="flex items-center gap-2">
              <Link
                href={`/admin/students/${student.id}?historyPage=${Math.max(1, historyPage - 1)}#timeline`}
                className={`focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold ${historyPage <= 1 ? "pointer-events-none opacity-50" : "hover:bg-stone-50"}`}
              >
                <ChevronLeft className="h-4 w-4" /> Trước
              </Link>
              <Link
                href={`/admin/students/${student.id}?historyPage=${Math.min(historyPageCount, historyPage + 1)}#timeline`}
                className={`focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold ${historyPage >= historyPageCount ? "pointer-events-none opacity-50" : "hover:bg-stone-50"}`}
              >
                Sau <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
