// Diễn giải AuditLog thành câu tiếng Việt cho trang Nhật ký. Không import prisma: hàm thuần,
// có unit test (tests/audit-format.test.ts).

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "student.created": "Thêm học sinh",
  "student.updated": "Sửa hồ sơ học sinh",
  "student.archived": "Lưu trữ học sinh",
  "student.restored": "Khôi phục học sinh",
  "student.bulk_imported": "Nhập học sinh từ Excel",
  "enrollment.created": "Thêm vào lớp",
  "enrollment.rejoined": "Quay lại lớp",
  "enrollment.left": "Nghỉ lớp",
  "month_plan.updated": "Sửa số buổi / tình trạng tháng",
  "invoice.created": "Tạo hóa đơn",
  "invoice.voided": "Hủy hóa đơn",
  "invoice.waived": "Miễn học phí",
  "invoice.restored": "Khôi phục hóa đơn",
  "invoice.memo_changed": "Đổi nội dung chuyển khoản",
  "class.created": "Tạo lớp",
  "class.updated": "Sửa lớp",
  "class.archived": "Lưu trữ lớp",
  "class.restored": "Khôi phục lớp",
  "schedule.created": "Thêm lịch học",
  "schedule.updated": "Sửa lịch học",
  "schedule.stopped": "Ngừng lịch học",
  "schedule.deleted": "Xóa lịch học",
  "session.cancelled": "Ghi lớp nghỉ",
  "session.cleared": "Bỏ ghi nghỉ / buổi bù",
  "session.makeup_added": "Thêm buổi học bù",
  "session.day_cancelled": "Nghỉ cả ngày",
  "transaction.assigned": "Gán giao dịch",
  "transaction.auto_assigned": "Tự gán giao dịch (SePay)",
  "transaction.unassigned": "Bỏ gán giao dịch",
  "transaction.reversed": "Hoàn giao dịch",
  "transaction.resolved": "Đánh dấu giao dịch đã xử lý",
  "salary.paid": "Trả lương",
  "salary.cutoff_changed": "Đổi ngày chốt lương",
  "salary.class_cutoff_changed": "Đổi ngày chốt lương lớp",
  "salary.written_off": "Bỏ qua lương tháng",
  "salary.write_off_undone": "Hủy bỏ qua lương",
  "expense.deleted": "Xóa khoản chi",
  "admin_user.created": "Tạo tài khoản quản lý",
  "admin_user.deleted": "Xóa tài khoản quản lý",
  "admin_user.password_reset": "Đặt lại mật khẩu quản lý phụ",
  "admin_user.password_changed": "Đổi mật khẩu (đăng xuất thiết bị khác)"
};

/** Nhóm thao tác cho bộ lọc trên trang Nhật ký. */
export const AUDIT_ACTION_GROUPS: Array<{ value: string; label: string; prefixes: string[] }> = [
  { value: "students", label: "Học sinh", prefixes: ["student."] },
  { value: "enrollments", label: "Xếp lớp / nghỉ lớp", prefixes: ["enrollment."] },
  { value: "sessions", label: "Số buổi, hóa đơn", prefixes: ["month_plan.", "invoice."] },
  { value: "classes", label: "Lớp, lịch học", prefixes: ["class.", "schedule.", "session."] },
  { value: "money", label: "Giao dịch, lương, chi", prefixes: ["transaction.", "salary.", "expense."] },
  { value: "accounts", label: "Tài khoản", prefixes: ["admin_user."] }
];

const FIELD_LABELS: Record<string, string> = {
  fullName: "Tên",
  phone: "SĐT",
  address: "Địa chỉ",
  parentName: "Phụ huynh",
  note: "Ghi chú",
  name: "Tên lớp",
  teacherName: "Giáo viên",
  pricePerSession: "Học phí/buổi",
  sessionsPerMonthDefault: "Số buổi mặc định",
  teacherSharePercent: "% giáo viên",
  salaryCutoff: "Ngày chốt lương",
  sessions: "Số buổi",
  status: "Tình trạng"
};

const MONEY_FIELDS = new Set(["pricePerSession", "amount"]);
const STATUS_LABELS: Record<string, string> = { active: "Đang học", on_leave: "Bảo lưu" };
const WEEKDAYS = ["", "T2", "T3", "T4", "T5", "T6", "T7", "CN"];

type Meta = Record<string, unknown>;

function asMeta(value: unknown): Meta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {};
}

function money(value: unknown) {
  return typeof value === "number" ? `${value.toLocaleString("vi-VN")}đ` : String(value ?? "");
}

function show(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "(trống)";
  if (MONEY_FIELDS.has(field)) return money(value);
  if (field === "status") return STATUS_LABELS[String(value)] ?? String(value);
  if (field === "teacherSharePercent") return `${value}%`;
  return String(value);
}

function isoDay(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  // Mốc 0h giờ VN lưu dạng UTC lệch -7h (vd 2026-10-31T17:00Z = 01/11): đổi về giờ VN trước.
  if (value.length > 10) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(date);
    }
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export type AuditChange = { label: string; from: string; to: string };

/** Thay đổi từng trường từ metadata.changes, đã dịch nhãn và định dạng giá trị. */
export function listChanges(changes: unknown): AuditChange[] {
  return Object.entries(asMeta(changes)).map(([field, change]) => {
    const { from, to } = asMeta(change);
    return { label: FIELD_LABELS[field] ?? field, from: show(field, from), to: show(field, to) };
  });
}

/** "Số buổi: 8 → 7", "SĐT: 0901… → 0902…" từ metadata.changes. */
export function describeChanges(changes: unknown): string[] {
  return listChanges(changes).map((change) => `${change.label}: ${change.from} → ${change.to}`);
}

export type AuditLogLike = {
  action: string;
  reason: string | null;
  metadata: unknown;
};

export type AuditDescription = {
  title: string;
  /** Thông tin ngắn (kỳ, số tiền, ngày…), không gồm thay đổi trước/sau và lý do. */
  summary: string[];
  changes: AuditChange[];
  reason: string | null;
  /** Tất cả gộp thành dòng chữ (summary, thay đổi, lý do). */
  details: string[];
};

/** Tiêu đề, thông tin tóm tắt, thay đổi trước/sau và lý do của một log. */
export function describeAudit(log: AuditLogLike): AuditDescription {
  const meta = asMeta(log.metadata);
  const title = AUDIT_ACTION_LABELS[log.action] ?? log.action;
  const details: string[] = [];
  const changes: AuditChange[] = [];
  const period = typeof meta.month === "number" && typeof meta.year === "number" ? `T${meta.month}/${meta.year}` : "";

  switch (log.action) {
    case "student.created":
      details.push(`${meta.fullName ?? ""} · ${meta.phone ?? ""}`);
      break;
    case "enrollment.created":
      details.push(`Bắt đầu học ${isoDay(meta.startDate)}`);
      if (typeof meta.sessionsOverride === "number") details.push(`Số buổi riêng: ${meta.sessionsOverride}`);
      break;
    case "enrollment.rejoined":
      details.push(`Học lại từ ${isoDay(meta.startDate)} (đã nghỉ từ ${isoDay(meta.previousLeftAt)})`);
      break;
    case "enrollment.left":
      details.push(`Nghỉ từ ${isoDay(meta.leftAt)}`);
      break;
    case "month_plan.updated":
      if (period) details.push(period);
      if (typeof meta.amountFrom === "number" && typeof meta.amountTo === "number" && meta.amountFrom !== meta.amountTo) {
        changes.push({ label: "Hóa đơn", from: money(meta.amountFrom), to: money(meta.amountTo) });
      }
      if (typeof meta.sessionsNote === "string" && meta.sessionsNote) details.push(`Diễn giải: ${meta.sessionsNote}`);
      break;
    case "invoice.created":
      details.push(`${period} · ${meta.sessions ?? "?"} buổi · ${money(meta.amount)}`);
      if (typeof meta.sessionsNote === "string" && meta.sessionsNote) details.push(`Diễn giải: ${meta.sessionsNote}`);
      break;
    case "invoice.voided":
    case "invoice.waived":
    case "invoice.restored":
      if (period) details.push(typeof meta.amount === "number" ? `${period} · ${money(meta.amount)}` : period);
      break;
    case "invoice.memo_changed":
      changes.push({ label: "Nội dung CK", from: String(meta.from ?? ""), to: String(meta.to ?? "") });
      break;
    case "class.created":
      details.push(
        `${meta.name ?? ""} (${meta.shortCode ?? ""}) · ${money(meta.pricePerSession)}/buổi · ${meta.sessionsPerMonthDefault ?? "?"} buổi/tháng`
      );
      break;
    case "schedule.created":
      details.push(`${WEEKDAYS[Number(meta.weekday)] ?? ""} ${meta.startTime ?? ""}–${meta.endTime ?? ""}`);
      break;
    case "schedule.updated": {
      const from = asMeta(meta.from);
      const to = asMeta(meta.to);
      changes.push({
        label: "Lịch",
        from: `${WEEKDAYS[Number(from.weekday)] ?? ""} ${from.startTime ?? ""}–${from.endTime ?? ""}`,
        to: `${WEEKDAYS[Number(to.weekday)] ?? ""} ${to.startTime ?? ""}–${to.endTime ?? ""}`
      });
      break;
    }
    case "schedule.stopped":
    case "schedule.deleted":
      details.push(`${WEEKDAYS[Number(meta.weekday)] ?? ""} ${meta.startTime ?? ""}–${meta.endTime ?? ""}, từ ${isoDay(meta.fromDate)}`);
      break;
    case "session.cancelled":
    case "session.cleared":
      details.push(`Buổi ${isoDay(meta.date)} ${meta.startTime ?? ""}`);
      break;
    case "session.makeup_added":
      details.push(
        meta.fromDate
          ? `Dời buổi ${isoDay(meta.fromDate)} sang ${isoDay(meta.date)} ${meta.startTime ?? ""}`
          : `Buổi bù ${isoDay(meta.date)} ${meta.startTime ?? ""}`
      );
      break;
    case "session.day_cancelled":
      details.push(`Ngày ${isoDay(meta.date)} · ${meta.cancelledSessions ?? 0} buổi`);
      break;
    case "transaction.assigned":
    case "transaction.auto_assigned":
    case "transaction.unassigned":
    case "transaction.reversed":
      if (typeof meta.amount === "number") details.push(money(meta.amount));
      break;
    default:
      if (period) details.push(period);
  }

  changes.push(...listChanges(meta.changes));
  const summary = details.filter((line) => line.trim() && line.trim() !== "·");
  const reason = log.reason?.trim() || null;
  return {
    title,
    summary,
    changes,
    reason,
    details: [
      ...summary,
      ...changes.map((change) => `${change.label}: ${change.from} → ${change.to}`),
      ...(reason ? [`Lý do: ${reason}`] : [])
    ]
  };
}

/** Nhóm (giá trị của AUDIT_ACTION_GROUPS) của một thao tác; "other" nếu không thuộc nhóm nào. */
export function auditGroupOf(action: string) {
  return AUDIT_ACTION_GROUPS.find((group) => group.prefixes.some((prefix) => action.startsWith(prefix)))?.value ?? "other";
}

/** Thao tác cần chú ý (mất tiền, mất dữ liệu): trang Nhật ký tô đỏ. */
const DANGER_ACTIONS = new Set([
  "invoice.voided",
  "invoice.waived",
  "enrollment.left",
  "student.archived",
  "class.archived",
  "schedule.deleted",
  "schedule.stopped",
  "session.day_cancelled",
  "transaction.unassigned",
  "transaction.reversed",
  "salary.paid",
  "salary.written_off",
  "expense.deleted",
  "admin_user.created",
  "admin_user.deleted",
  "admin_user.password_reset",
  "admin_user.password_changed"
]);

export function isDangerAction(action: string) {
  return DANGER_ACTIONS.has(action);
}

/** Điều kiện lọc theo nhóm thao tác (giá trị của AUDIT_ACTION_GROUPS). */
export function actionPrefixesForGroup(group: string | undefined) {
  return AUDIT_ACTION_GROUPS.find((item) => item.value === group)?.prefixes ?? null;
}
