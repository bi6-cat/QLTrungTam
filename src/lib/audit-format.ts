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
  "admin_user.password_reset": "Đặt lại mật khẩu"
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

/** "Số buổi 8 → 7", "SĐT 0901… → 0902…" từ metadata.changes. */
export function describeChanges(changes: unknown): string[] {
  return Object.entries(asMeta(changes)).map(([field, change]) => {
    const { from, to } = asMeta(change);
    return `${FIELD_LABELS[field] ?? field}: ${show(field, from)} → ${show(field, to)}`;
  });
}

export type AuditLogLike = {
  action: string;
  reason: string | null;
  metadata: unknown;
};

/** Tiêu đề + các dòng chi tiết của một log. */
export function describeAudit(log: AuditLogLike): { title: string; details: string[] } {
  const meta = asMeta(log.metadata);
  const title = AUDIT_ACTION_LABELS[log.action] ?? log.action;
  const details: string[] = [];
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
        details.push(`Hóa đơn: ${money(meta.amountFrom)} → ${money(meta.amountTo)}`);
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
      details.push(`${meta.from ?? ""} → ${meta.to ?? ""}`);
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
      details.push(
        `${WEEKDAYS[Number(from.weekday)] ?? ""} ${from.startTime ?? ""}–${from.endTime ?? ""} → ${WEEKDAYS[Number(to.weekday)] ?? ""} ${to.startTime ?? ""}–${to.endTime ?? ""}`
      );
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

  details.push(...describeChanges(meta.changes));
  if (log.reason) details.push(`Lý do: ${log.reason}`);
  return { title, details: details.filter(Boolean) };
}

/** Điều kiện lọc theo nhóm thao tác (giá trị của AUDIT_ACTION_GROUPS). */
export function actionPrefixesForGroup(group: string | undefined) {
  return AUDIT_ACTION_GROUPS.find((item) => item.value === group)?.prefixes ?? null;
}
