export const MAX_STUDENT_IMPORT_ROWS = 500;
export const MAX_STUDENT_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export type StudentImportField =
  | "fullName"
  | "phone"
  | "parentName"
  | "address"
  | "classCodes"
  | "sessionsOverride"
  | "status"
  | "note";

export type StudentImportDraftRow = {
  rowNumber: number;
  fullName: string;
  phone: string;
  parentName: string;
  address: string;
  classCodes: string;
  sessionsOverride: string;
  status: string;
  note: string;
};

export type StudentImportIssue = {
  severity: "error" | "warning";
  code: string;
  field?: StudentImportField;
  message: string;
};

export type StudentImportResolvedClass = {
  id: string;
  name: string;
  shortCode: string;
};

export type StudentImportPreviewRow = StudentImportDraftRow & {
  issues: StudentImportIssue[];
  resolvedClasses: StudentImportResolvedClass[];
  existingStudentId: string | null;
};

export type StudentImportPreview = {
  rows: StudentImportPreviewRow[];
  summary: {
    totalRows: number;
    errorRows: number;
    warningRows: number;
    errorCount: number;
    warningCount: number;
  };
};

export type StudentImportCommitResult = {
  ok: true;
  batchId: string;
  createdStudents: number;
  reusedStudents: number;
  createdEnrollments: number;
  skippedEnrollments: number;
};
