import { normalizeName } from "@/lib/student-search";

/**
 * Phát hiện hồ sơ học sinh trùng lặp hoặc bất thường. Chỉ gồm hàm thuần (không chạm DB) để
 * kiểm thử được; mcp/tools-students.ts nạp dữ liệu rồi gọi vào đây.
 */

export type CheckStudent = {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  parentName: string | null;
  archived: boolean;
  /** Mã các lớp học sinh còn đang học (chưa nghỉ). */
  activeClassCodes: string[];
  enrollmentCount: number;
  unpaidInvoiceCount: number;
};

export type Severity = "high" | "medium" | "low";

export type DuplicateGroup = {
  kind: "same_name_and_phone" | "similar_name_same_phone" | "same_name_different_phone" | "same_phone_same_class";
  severity: Severity;
  reason: string;
  students: Array<{ id: string; fullName: string; phone: string; archived: boolean; classes: string[] }>;
};

export type Anomaly = {
  code: string;
  severity: Severity;
  message: string;
  studentId: string;
  fullName: string;
  phone: string;
};

const SEVERITY_RANK: Record<Severity, number> = { high: 3, medium: 2, low: 1 };

export function severityAtLeast(value: Severity, minimum: Severity) {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[minimum];
}

/** Khoảng cách chỉnh sửa Levenshtein, dừng sớm khi vượt ngưỡng. */
export function editDistance(left: string, right: string, limit = 2) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

function brief(student: CheckStudent) {
  return {
    id: student.id,
    fullName: student.fullName,
    phone: student.phone,
    archived: student.archived,
    classes: student.activeClassCodes
  };
}

export function findDuplicateGroups(students: CheckStudent[]): DuplicateGroup[] {
  const groups: DuplicateGroup[] = [];
  const seen = new Set<string>();
  const remember = (kind: string, ids: string[]) => {
    const key = `${kind}:${[...ids].sort().join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  const byName = new Map<string, CheckStudent[]>();
  const byPhone = new Map<string, CheckStudent[]>();
  for (const student of students) {
    const nameKey = normalizeName(student.fullName);
    byName.set(nameKey, [...(byName.get(nameKey) ?? []), student]);
    byPhone.set(student.phone, [...(byPhone.get(student.phone) ?? []), student]);
  }

  // 1) Trùng cả tên lẫn SĐT: gần như chắc chắn là nhập lặp.
  for (const [, sameName] of byName) {
    const byNamePhone = new Map<string, CheckStudent[]>();
    for (const student of sameName) {
      byNamePhone.set(student.phone, [...(byNamePhone.get(student.phone) ?? []), student]);
    }
    for (const [phone, items] of byNamePhone) {
      if (items.length > 1 && remember("exact", items.map((item) => item.id))) {
        groups.push({
          kind: "same_name_and_phone",
          severity: "high",
          reason: `${items.length} hồ sơ cùng tên và cùng SĐT ${phone} — nhiều khả năng nhập lặp.`,
          students: items.map(brief)
        });
      }
    }

    // 2) Cùng tên nhưng khác SĐT: có thể đổi số, cũng có thể chỉ trùng tên.
    const phones = new Set(sameName.map((student) => student.phone));
    if (phones.size > 1 && remember("name", sameName.map((item) => item.id))) {
      groups.push({
        kind: "same_name_different_phone",
        severity: "medium",
        reason: `Cùng tên nhưng ${phones.size} SĐT khác nhau (${[...phones].join(", ")}) — kiểm tra xem là một em đổi số hay hai em trùng tên.`,
        students: sameName.map(brief)
      });
    }
  }

  for (const [phone, sameStudents] of byPhone) {
    if (sameStudents.length < 2) continue;

    // 3) Cùng SĐT, tên gần giống (gõ sai một hai ký tự).
    for (let i = 0; i < sameStudents.length; i += 1) {
      for (let j = i + 1; j < sameStudents.length; j += 1) {
        const left = normalizeName(sameStudents[i].fullName);
        const right = normalizeName(sameStudents[j].fullName);
        if (left === right) continue;
        if (editDistance(left, right, 2) <= 2 && remember("similar", [sameStudents[i].id, sameStudents[j].id])) {
          groups.push({
            kind: "similar_name_same_phone",
            severity: "high",
            reason: `Cùng SĐT ${phone}, tên gần giống nhau ("${sameStudents[i].fullName}" / "${sameStudents[j].fullName}") — có thể gõ sai chính tả.`,
            students: [brief(sameStudents[i]), brief(sameStudents[j])]
          });
        }
      }
    }

    // 4) Cùng SĐT và cùng lớp: nội dung chuyển khoản sẽ trùng nhau, khó khớp hoá đơn.
    const byClass = new Map<string, CheckStudent[]>();
    for (const student of sameStudents) {
      for (const code of student.activeClassCodes) {
        byClass.set(code, [...(byClass.get(code) ?? []), student]);
      }
    }
    for (const [code, items] of byClass) {
      const distinct = new Map(items.map((item) => [item.id, item]));
      if (distinct.size > 1 && remember(`class:${code}`, [...distinct.keys()])) {
        groups.push({
          kind: "same_phone_same_class",
          severity: "high",
          reason: `${distinct.size} học sinh cùng SĐT ${phone} học chung lớp ${code} — nội dung chuyển khoản sẽ đụng nhau.`,
          students: [...distinct.values()].map(brief)
        });
      }
    }
  }

  return groups.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}

const PLACEHOLDER_PHONES = new Set(["0123456789", "0987654321", "0000000000", "1234567890"]);

export function findAnomalies(students: CheckStudent[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const student of students) {
    const add = (code: string, severity: Severity, message: string) =>
      anomalies.push({
        code,
        severity,
        message,
        studentId: student.id,
        fullName: student.fullName,
        phone: student.phone
      });

    const digits = student.phone.replace(/\D/g, "");
    if (!digits.startsWith("0") || (digits.length !== 10 && digits.length !== 11)) {
      add(
        "phone_format",
        "high",
        `SĐT "${student.phone}" không giống số Việt Nam (thường 10 số, bắt đầu bằng 0) — phụ huynh có thể gõ sai memo chuyển khoản.`
      );
    }
    if (PLACEHOLDER_PHONES.has(digits) || /^(\d)\1+$/.test(digits)) {
      add("phone_placeholder", "high", `SĐT "${student.phone}" trông như số điền tạm.`);
    }

    const name = student.fullName;
    if (/[0-9@#$%^&*_=+<>\\/|(){}[\]]/.test(name)) {
      add("name_symbols", "medium", `Tên "${name}" có chữ số hoặc ký tự lạ.`);
    }
    const words = name.trim().split(/\s+/);
    if (words.length < 2) {
      add("name_single_word", "medium", `Tên "${name}" chỉ có một từ — có thể thiếu họ hoặc tên đệm.`);
    }
    if (name !== name.trim() || /\s{2,}/.test(name)) {
      add("name_spacing", "low", `Tên "${name}" có khoảng trắng thừa.`);
    }
    const letters = name.replace(/[^\p{L}]/gu, "");
    if (letters.length >= 3 && (letters === letters.toUpperCase() || letters === letters.toLowerCase())) {
      add("name_case", "low", `Tên "${name}" viết toàn hoa hoặc toàn thường.`);
    }

    if (!student.address.trim()) add("address_empty", "low", "Chưa có địa chỉ.");
    if (!student.parentName) add("parent_missing", "low", "Chưa có tên phụ huynh.");

    if (!student.archived && student.enrollmentCount === 0) {
      add("no_enrollment", "medium", "Chưa ghi danh lớp nào (hồ sơ mồ côi?).");
    }
    if (student.archived && student.activeClassCodes.length > 0) {
      add(
        "archived_but_enrolled",
        "high",
        `Đã lưu trữ nhưng vẫn đang học lớp ${student.activeClassCodes.join(", ")}.`
      );
    }
    if (student.archived && student.unpaidInvoiceCount > 0) {
      add(
        "archived_with_debt",
        "medium",
        `Đã lưu trữ nhưng còn ${student.unpaidInvoiceCount} hoá đơn chưa thu.`
      );
    }
  }
  return anomalies.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
