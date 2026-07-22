import ExcelJS from "exceljs";
import {
  MAX_STUDENT_IMPORT_ROWS,
  type StudentImportDraftRow,
  type StudentImportField,
  type StudentImportIssue,
  type StudentImportPreview,
  type StudentImportPreviewRow
} from "@/lib/student-import-types";

export type StudentImportClassRecord = {
  id: string;
  name: string;
  shortCode: string;
  archivedAt: Date | null;
};

export type StudentImportExistingStudent = {
  id: string;
  fullName: string;
  phone: string;
  archivedAt: Date | null;
  enrollments: Array<{ classId: string }>;
};

export class StudentImportFileError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "StudentImportFileError";
  }
}

const FIELD_ALIASES: Record<StudentImportField, string[]> = {
  fullName: ["ho ten", "ho va ten", "ten hoc sinh", "hoc sinh", "full name", "fullname"],
  phone: ["so dien thoai", "sdt", "dien thoai", "phone", "phone number"],
  parentName: ["ten phu huynh", "phu huynh", "ho ten phu huynh", "parent", "parent name"],
  address: ["dia chi", "address"],
  classCodes: [
    "ma lop",
    "ma lop hoc",
    "lop",
    "lop hoc",
    "class code",
    "class codes"
  ],
  sessionsOverride: ["so buoi rieng", "so buoi", "buoi rieng", "sessions", "session override"],
  status: ["trang thai", "tinh trang", "status"],
  note: ["ghi chu", "note", "notes"]
};

const REQUIRED_HEADERS: StudentImportField[] = ["fullName", "phone", "classCodes"];
const MAX_CLASSES_PER_STUDENT_IMPORT_ROW = 20;

function normalizeComparison(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWhitespace(value: string) {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function normalizeIdentityText(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("vi");
}

export function normalizeImportPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function splitImportClassCodes(value: string) {
  return value
    .split(/[,;|\n]+/)
    .map((code) => code.trim().toUpperCase())
    .filter(Boolean);
}

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function parseImportStatus(value: string): "active" | "on_leave" | null {
  const normalized = normalizeComparison(value);
  if (!normalized || ["active", "dang hoc", "hoc"].includes(normalized)) return "active";
  if (["on leave", "on_leave", "bao luu", "tam nghi", "nghi"].includes(normalized)) {
    return "on_leave";
  }
  return null;
}

function parseSessionsOverride(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 60 ? parsed : undefined;
}

export function importStudentIdentityKey(row: Pick<StudentImportDraftRow, "fullName" | "phone">) {
  return `${normalizeIdentityText(row.fullName)}\u0000${normalizeImportPhone(row.phone)}`;
}

function textFromCell(cell: ExcelJS.Cell) {
  if (cell.value === null || cell.value === undefined) return "";
  return normalizeWhitespace(cell.text || String(cell.value));
}

function resolveHeader(value: string): StudentImportField | null {
  const normalized = normalizeComparison(value).replace(/\b(bat buoc|required)\b/g, "").trim();
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<
    [StudentImportField, string[]]
  >) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

function normalizeDraftRow(row: StudentImportDraftRow): StudentImportDraftRow {
  const status = parseImportStatus(row.status);
  const classCodes = unique(splitImportClassCodes(row.classCodes));
  return {
    rowNumber: row.rowNumber,
    fullName: normalizeWhitespace(row.fullName),
    phone: normalizeImportPhone(row.phone),
    parentName: normalizeWhitespace(row.parentName),
    address: normalizeWhitespace(row.address),
    classCodes: classCodes.join(", "),
    sessionsOverride: row.sessionsOverride.trim(),
    status: status ?? row.status.trim(),
    note: row.note.trim()
  };
}

function isLegacyBinaryXls(buffer: Buffer) {
  const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return buffer.length >= oleHeader.length && buffer.subarray(0, oleHeader.length).equals(oleHeader);
}

export async function parseStudentImportWorkbook(data: ArrayBuffer | Uint8Array) {
  const buffer = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
  if (isLegacyBinaryXls(buffer)) {
    throw new StudentImportFileError(
      "Tệp .xls kiểu Excel 97-2003 chưa đọc được trực tiếp. Hãy mở tệp và chọn Lưu thành .xlsx rồi tải lại.",
      "LEGACY_XLS_UNSUPPORTED"
    );
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new StudentImportFileError(
      "Không đọc được tệp Excel. Hãy dùng tệp .xlsx hợp lệ hoặc tải mẫu mới từ hệ thống.",
      "INVALID_WORKBOOK"
    );
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
  if (!worksheet) {
    throw new StudentImportFileError("Tệp Excel không có dữ liệu.", "EMPTY_WORKBOOK");
  }

  let headerRowNumber = 0;
  let headerMap = new Map<StudentImportField, number>();
  const scanUntil = Math.min(Math.max(worksheet.actualRowCount, 1), 15);

  for (let rowNumber = 1; rowNumber <= scanUntil; rowNumber += 1) {
    const candidate = new Map<StudentImportField, number>();
    worksheet.getRow(rowNumber).eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const field = resolveHeader(textFromCell(cell));
      if (field && !candidate.has(field)) candidate.set(field, columnNumber);
    });
    if (REQUIRED_HEADERS.every((field) => candidate.has(field))) {
      headerRowNumber = rowNumber;
      headerMap = candidate;
      break;
    }
  }

  if (!headerRowNumber) {
    throw new StudentImportFileError(
      "Không tìm thấy đủ các cột bắt buộc: Họ và tên, Số điện thoại, Mã lớp.",
      "MISSING_HEADERS"
    );
  }

  const rows: StudentImportDraftRow[] = [];
  for (let rowNumber = headerRowNumber + 1; rowNumber <= worksheet.actualRowCount; rowNumber += 1) {
    const sheetRow = worksheet.getRow(rowNumber);
    const value = (field: StudentImportField) => {
      const columnNumber = headerMap.get(field);
      return columnNumber ? textFromCell(sheetRow.getCell(columnNumber)) : "";
    };
    const row: StudentImportDraftRow = {
      rowNumber,
      fullName: value("fullName"),
      phone: value("phone"),
      parentName: value("parentName"),
      address: value("address"),
      classCodes: value("classCodes"),
      sessionsOverride: value("sessionsOverride"),
      status: value("status") || "active",
      note: value("note")
    };
    if (
      !row.fullName &&
      !row.phone &&
      !row.parentName &&
      !row.address &&
      !row.classCodes &&
      !row.sessionsOverride &&
      !row.note
    ) {
      continue;
    }
    rows.push(row);
    if (rows.length > MAX_STUDENT_IMPORT_ROWS) {
      throw new StudentImportFileError(
        `Mỗi lần chỉ nhập tối đa ${MAX_STUDENT_IMPORT_ROWS} dòng. Hãy chia tệp thành nhiều phần.`,
        "TOO_MANY_ROWS"
      );
    }
  }

  if (rows.length === 0) {
    throw new StudentImportFileError("Tệp Excel chưa có dòng học sinh nào.", "NO_DATA_ROWS");
  }
  return rows;
}

function textValue(value: unknown, field: string) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value === null || value === undefined) return "";
  throw new StudentImportFileError(`Trường ${field} không đúng định dạng.`, "INVALID_ROW_PAYLOAD");
}

export function coerceStudentImportRows(value: unknown): StudentImportDraftRow[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new StudentImportFileError("Danh sách nhập đang trống.", "NO_DATA_ROWS");
  }
  if (value.length > MAX_STUDENT_IMPORT_ROWS) {
    throw new StudentImportFileError(
      `Mỗi lần chỉ nhập tối đa ${MAX_STUDENT_IMPORT_ROWS} dòng.`,
      "TOO_MANY_ROWS"
    );
  }
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new StudentImportFileError(`Dòng ${index + 1} không đúng định dạng.`, "INVALID_ROW_PAYLOAD");
    }
    const record = raw as Record<string, unknown>;
    const rowNumberValue = Number(record.rowNumber);
    const row: StudentImportDraftRow = {
      rowNumber:
        Number.isSafeInteger(rowNumberValue) && rowNumberValue > 0 ? rowNumberValue : index + 2,
      fullName: textValue(record.fullName, "Họ và tên"),
      phone: textValue(record.phone, "Số điện thoại"),
      parentName: textValue(record.parentName, "Tên phụ huynh"),
      address: textValue(record.address, "Địa chỉ"),
      classCodes: textValue(record.classCodes, "Mã lớp"),
      sessionsOverride: textValue(record.sessionsOverride, "Số buổi riêng"),
      status: textValue(record.status, "Trạng thái"),
      note: textValue(record.note, "Ghi chú")
    };
    const rawLength = Object.values(row).reduce<number>(
      (total, item) => total + (typeof item === "string" ? item.length : 0),
      0
    );
    if (rawLength > 4_000) {
      throw new StudentImportFileError(`Dòng ${row.rowNumber} có dữ liệu quá dài.`, "ROW_TOO_LARGE");
    }
    return row;
  });
}

function addIssue(row: StudentImportPreviewRow, issue: StudentImportIssue) {
  if (
    !row.issues.some(
      (current) =>
        current.code === issue.code && current.field === issue.field && current.message === issue.message
    )
  ) {
    row.issues.push(issue);
  }
}

function validateOwnFields(row: StudentImportPreviewRow) {
  if (!row.fullName) {
    addIssue(row, {
      severity: "error",
      code: "FULL_NAME_REQUIRED",
      field: "fullName",
      message: "Thiếu họ và tên học sinh."
    });
  } else if (row.fullName.length > 120) {
    addIssue(row, {
      severity: "error",
      code: "FULL_NAME_TOO_LONG",
      field: "fullName",
      message: "Họ và tên không được quá 120 ký tự."
    });
  }

  if (row.phone.length < 8 || row.phone.length > 12) {
    addIssue(row, {
      severity: "error",
      code: "PHONE_INVALID",
      field: "phone",
      message: "Số điện thoại phải có từ 8 đến 12 chữ số."
    });
  }
  if (row.parentName.length > 120) {
    addIssue(row, {
      severity: "error",
      code: "PARENT_NAME_TOO_LONG",
      field: "parentName",
      message: "Tên phụ huynh không được quá 120 ký tự."
    });
  }
  if (row.address.length > 300) {
    addIssue(row, {
      severity: "error",
      code: "ADDRESS_TOO_LONG",
      field: "address",
      message: "Địa chỉ không được quá 300 ký tự."
    });
  }
  if (row.note.length > 1_000) {
    addIssue(row, {
      severity: "error",
      code: "NOTE_TOO_LONG",
      field: "note",
      message: "Ghi chú không được quá 1.000 ký tự."
    });
  }
  const sessionsOverride = parseSessionsOverride(row.sessionsOverride);
  const status = parseImportStatus(row.status);
  if (sessionsOverride === undefined) {
    addIssue(row, {
      severity: "error",
      code: "SESSIONS_INVALID",
      field: "sessionsOverride",
      message: "Số buổi riêng phải là số nguyên từ 0 đến 60 hoặc để trống."
    });
  }
  if (!status) {
    addIssue(row, {
      severity: "error",
      code: "STATUS_INVALID",
      field: "status",
      message: "Trạng thái chỉ nhận Đang học hoặc Bảo lưu."
    });
  }
  if (status === "active" && sessionsOverride === 0) {
    addIssue(row, {
      severity: "error",
      code: "ACTIVE_ZERO_SESSIONS",
      field: "sessionsOverride",
      message: "Học sinh đang học phải có số buổi lớn hơn 0; để trống để dùng mặc định của lớp."
    });
  }
}

export function buildStudentImportPreview(args: {
  rows: StudentImportDraftRow[];
  classes: StudentImportClassRecord[];
  existingStudents: StudentImportExistingStudent[];
}): StudentImportPreview {
  const rows: StudentImportPreviewRow[] = args.rows.map((input) => ({
    ...normalizeDraftRow(input),
    issues: [],
    resolvedClasses: [],
    existingStudentId: null
  }));
  const classesByCode = new Map(args.classes.map((item) => [item.shortCode.toUpperCase(), item]));

  for (const [rowIndex, row] of rows.entries()) {
    validateOwnFields(row);
    const rawClassCodes = splitImportClassCodes(args.rows[rowIndex]?.classCodes ?? "");
    const classCodes = splitImportClassCodes(row.classCodes);
    if (classCodes.length === 0) {
      addIssue(row, {
        severity: "error",
        code: "CLASS_REQUIRED",
        field: "classCodes",
        message: "Cần nhập ít nhất một mã lớp."
      });
    }
    if (classCodes.length > MAX_CLASSES_PER_STUDENT_IMPORT_ROW) {
      addIssue(row, {
        severity: "error",
        code: "TOO_MANY_CLASSES",
        field: "classCodes",
        message: `Mỗi học sinh chỉ được nhập tối đa ${MAX_CLASSES_PER_STUDENT_IMPORT_ROW} lớp trong một lần.`
      });
    }
    if (rawClassCodes.length !== unique(rawClassCodes).length) {
      addIssue(row, {
        severity: "error",
        code: "DUPLICATE_CLASS_IN_ROW",
        field: "classCodes",
        message: "Một mã lớp đang bị lặp lại trong cùng dòng."
      });
    }
    for (const code of classCodes) {
      const classRoom = classesByCode.get(code);
      if (!classRoom) {
        addIssue(row, {
          severity: "error",
          code: "CLASS_NOT_FOUND",
          field: "classCodes",
          message: `Không tìm thấy lớp có mã ${code}.`
        });
      } else if (classRoom.archivedAt) {
        addIssue(row, {
          severity: "error",
          code: "CLASS_ARCHIVED",
          field: "classCodes",
          message: `Lớp ${code} đã lưu trữ; hãy khôi phục lớp trước khi nhập.`
        });
      } else {
        row.resolvedClasses.push({ id: classRoom.id, name: classRoom.name, shortCode: classRoom.shortCode });
      }
    }
  }

  const rowsByPhone = new Map<string, StudentImportPreviewRow[]>();
  for (const row of rows) {
    if (row.phone.length < 8 || row.phone.length > 12) continue;
    const group = rowsByPhone.get(row.phone) ?? [];
    group.push(row);
    rowsByPhone.set(row.phone, group);
  }
  for (const group of rowsByPhone.values()) {
    if (group.length < 2) continue;
    for (const row of group) {
      addIssue(row, {
        severity: "warning",
        code: "PHONE_DUPLICATE_IN_FILE",
        field: "phone",
        message: `Số điện thoại này xuất hiện ở ${group.length} dòng trong tệp. Hãy kiểm tra trường hợp anh/chị em dùng chung số.`
      });
    }
  }

  const rowsByIdentity = new Map<string, StudentImportPreviewRow[]>();
  for (const row of rows) {
    if (!row.fullName || row.phone.length < 8 || row.phone.length > 12) continue;
    const key = importStudentIdentityKey(row);
    const group = rowsByIdentity.get(key) ?? [];
    group.push(row);
    rowsByIdentity.set(key, group);
  }
  for (const group of rowsByIdentity.values()) {
    if (group.length < 2) continue;
    const profile = (row: StudentImportPreviewRow) =>
      [row.parentName, row.address, row.note].map(normalizeIdentityText).join("\u0000");
    if (new Set(group.map(profile)).size > 1) {
      for (const row of group) {
        addIssue(row, {
          severity: "error",
          code: "STUDENT_PROFILE_CONFLICT",
          message: "Cùng học sinh xuất hiện nhiều dòng nhưng thông tin phụ huynh, địa chỉ hoặc ghi chú không khớp."
        });
      }
    }
    const classOwners = new Map<string, StudentImportPreviewRow[]>();
    for (const row of group) {
      for (const code of splitImportClassCodes(row.classCodes)) {
        const owners = classOwners.get(code) ?? [];
        owners.push(row);
        classOwners.set(code, owners);
      }
    }
    for (const [code, owners] of classOwners) {
      if (owners.length < 2) continue;
      for (const row of owners) {
        addIssue(row, {
          severity: "error",
          code: "DUPLICATE_ENROLLMENT_IN_PAYLOAD",
          field: "classCodes",
          message: `Học sinh bị ghi danh lặp vào lớp ${code} trong tệp.`
        });
      }
    }
  }

  const dbStudentsByPhone = new Map<string, StudentImportExistingStudent[]>();
  for (const student of args.existingStudents) {
    const phone = normalizeImportPhone(student.phone);
    const group = dbStudentsByPhone.get(phone) ?? [];
    group.push(student);
    dbStudentsByPhone.set(phone, group);
  }

  for (const row of rows) {
    const matches = dbStudentsByPhone.get(row.phone) ?? [];
    if (matches.length === 0) continue;
    const exactMatches = matches.filter(
      (student) => normalizeIdentityText(student.fullName) === normalizeIdentityText(row.fullName)
    );
    if (exactMatches.some((student) => student.archivedAt)) {
      addIssue(row, {
        severity: "error",
        code: "STUDENT_ARCHIVED",
        field: "fullName",
        message: "Hồ sơ học sinh trùng tên và số điện thoại đang được lưu trữ. Hãy khôi phục hồ sơ thay vì nhập mới."
      });
      continue;
    }
    if (exactMatches.length > 1) {
      addIssue(row, {
        severity: "error",
        code: "AMBIGUOUS_EXISTING_STUDENT",
        field: "fullName",
        message: "Có nhiều hồ sơ hiện hữu trùng cả tên và số điện thoại; cần xử lý trùng hồ sơ trước khi nhập."
      });
      continue;
    }
    if (exactMatches.length === 1) {
      const existing = exactMatches[0];
      row.existingStudentId = existing.id;
      addIssue(row, {
        severity: "warning",
        code: "EXISTING_STUDENT_REUSED",
        field: "phone",
        message: `Đã có hồ sơ ${existing.fullName}; hệ thống chỉ bổ sung lớp và không ghi đè thông tin hồ sơ.`
      });
      const enrolledClassIds = new Set(existing.enrollments.map((item) => item.classId));
      for (const classRoom of row.resolvedClasses) {
        if (enrolledClassIds.has(classRoom.id)) {
          addIssue(row, {
            severity: "warning",
            code: "ENROLLMENT_ALREADY_EXISTS",
            field: "classCodes",
            message: `${existing.fullName} đã có trong lớp ${classRoom.shortCode}; ghi danh này sẽ được bỏ qua.`
          });
        }
      }
    } else {
      const examples = matches
        .slice(0, 3)
        .map((student) => `${student.fullName}${student.archivedAt ? " (đã lưu trữ)" : ""}`)
        .join(", ");
      addIssue(row, {
        severity: "warning",
        code: "PHONE_EXISTS_IN_DATABASE",
        field: "phone",
        message: `Số điện thoại đã được dùng bởi ${examples}${matches.length > 3 ? "…" : ""}.`
      });
    }
  }

  const phoneClassRows = new Map<string, StudentImportPreviewRow[]>();
  for (const row of rows) {
    for (const classRoom of row.resolvedClasses) {
      const key = `${row.phone}\u0000${classRoom.id}`;
      const group = phoneClassRows.get(key) ?? [];
      group.push(row);
      phoneClassRows.set(key, group);
    }
  }
  for (const group of phoneClassRows.values()) {
    const identities = new Set(group.map(importStudentIdentityKey));
    if (identities.size < 2) continue;
    for (const row of group) {
      addIssue(row, {
        severity: "warning",
        code: "PHONE_CLASS_MEMO_COLLISION",
        field: "phone",
        message: "Nhiều học sinh dùng chung số điện thoại trong cùng lớp; nội dung chuyển khoản có thể bị trùng."
      });
    }
  }

  for (const row of rows) {
    const samePhoneStudents = dbStudentsByPhone.get(row.phone) ?? [];
    for (const classRoom of row.resolvedClasses) {
      const colliding = samePhoneStudents.some(
        (student) =>
          student.id !== row.existingStudentId &&
          !student.archivedAt &&
          student.enrollments.some((item) => item.classId === classRoom.id)
      );
      if (colliding) {
        addIssue(row, {
          severity: "warning",
          code: "PHONE_CLASS_MEMO_COLLISION_DB",
          field: "phone",
          message: `Đã có học sinh khác dùng số điện thoại này trong lớp ${classRoom.shortCode}; nội dung chuyển khoản có thể bị trùng.`
        });
      }
    }
  }

  for (const row of rows) {
    row.issues.sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
      return left.message.localeCompare(right.message, "vi");
    });
  }
  const errorRows = rows.filter((row) => row.issues.some((issue) => issue.severity === "error"));
  const warningRows = rows.filter((row) => row.issues.some((issue) => issue.severity === "warning"));
  return {
    rows,
    summary: {
      totalRows: rows.length,
      errorRows: errorRows.length,
      warningRows: warningRows.length,
      errorCount: rows.reduce(
        (total, row) => total + row.issues.filter((issue) => issue.severity === "error").length,
        0
      ),
      warningCount: rows.reduce(
        (total, row) => total + row.issues.filter((issue) => issue.severity === "warning").length,
        0
      )
    }
  };
}

export function getImportEnrollmentValues(row: StudentImportDraftRow) {
  const status = parseImportStatus(row.status);
  const sessionsOverride = parseSessionsOverride(row.sessionsOverride);
  if (!status || sessionsOverride === undefined) {
    throw new Error("Dòng import chưa được kiểm tra hợp lệ.");
  }
  return { status, sessionsOverride };
}
