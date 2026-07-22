import assert from "node:assert/strict";
import { describe, test } from "node:test";
import ExcelJS from "exceljs";
import {
  buildStudentImportPreview,
  parseStudentImportWorkbook
} from "../src/lib/student-import";
import type { StudentImportDraftRow } from "../src/lib/student-import-types";

function row(overrides: Partial<StudentImportDraftRow> = {}): StudentImportDraftRow {
  return {
    rowNumber: 2,
    fullName: "Nguyễn Văn An",
    phone: "0912 345 678",
    parentName: "Nguyễn Văn Bình",
    address: "Hà Nội",
    classCodes: "TOAN6",
    sessionsOverride: "",
    status: "Đang học",
    note: "",
    ...overrides
  };
}

const activeClass = {
  id: "class-toan-6",
  name: "Toán 6",
  shortCode: "TOAN6",
  archivedAt: null
};

describe("student import workbook parser", () => {
  test("recognizes friendly Vietnamese headers and normalizes row values", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Dữ liệu");
    sheet.addRow([
      "Họ và tên*",
      "SĐT",
      "Tên phụ huynh",
      "Địa chỉ",
      "Mã lớp*",
      "Số buổi riêng",
      "Trạng thái",
      "Ghi chú"
    ]);
    sheet.addRow([
      "  Nguyễn   Văn An ",
      "0912-345-678",
      "Nguyễn Văn Bình",
      "Hà Nội",
      "toan6, van6",
      8,
      "Bảo lưu",
      "Đón muộn"
    ]);

    const data = await workbook.xlsx.writeBuffer();
    const rows = await parseStudentImportWorkbook(Buffer.from(data));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].rowNumber, 2);
    assert.equal(rows[0].fullName, "Nguyễn Văn An");
    assert.equal(rows[0].phone, "0912-345-678");
    assert.equal(rows[0].classCodes, "toan6, van6");
    assert.equal(rows[0].status, "Bảo lưu");
  });
});

describe("student import validation", () => {
  test("resolves class codes and normalizes accepted fields", () => {
    const preview = buildStudentImportPreview({
      rows: [row()],
      classes: [activeClass],
      existingStudents: []
    });

    assert.equal(preview.summary.errorCount, 0);
    assert.equal(preview.rows[0].phone, "0912345678");
    assert.equal(preview.rows[0].status, "active");
    assert.equal(preview.rows[0].resolvedClasses[0].id, activeClass.id);
  });

  test("reports required fields, invalid sessions and unavailable classes as errors", () => {
    const preview = buildStudentImportPreview({
      rows: [
        row({
          fullName: "",
          phone: "123",
          classCodes: "UNKNOWN, OLD",
          sessionsOverride: "61"
        })
      ],
      classes: [{ ...activeClass, id: "old", shortCode: "OLD", archivedAt: new Date() }],
      existingStudents: []
    });
    const codes = new Set(preview.rows[0].issues.map((issue) => issue.code));

    assert.ok(codes.has("FULL_NAME_REQUIRED"));
    assert.ok(codes.has("PHONE_INVALID"));
    assert.ok(codes.has("SESSIONS_INVALID"));
    assert.ok(codes.has("CLASS_NOT_FOUND"));
    assert.ok(codes.has("CLASS_ARCHIVED"));
    assert.ok(preview.summary.errorCount >= 5);
  });

  test("blocks an explicit zero-session active enrollment but allows it on leave", () => {
    const active = buildStudentImportPreview({
      rows: [row({ sessionsOverride: "0", status: "Đang học" })],
      classes: [activeClass],
      existingStudents: []
    });
    assert.ok(active.rows[0].issues.some((issue) => issue.code === "ACTIVE_ZERO_SESSIONS"));

    const onLeave = buildStudentImportPreview({
      rows: [row({ sessionsOverride: "0", status: "Bảo lưu" })],
      classes: [activeClass],
      existingStudents: []
    });
    assert.equal(onLeave.summary.errorCount, 0);
  });

  test("warns for shared phone in the same class because payment memos can collide", () => {
    const preview = buildStudentImportPreview({
      rows: [
        row({ rowNumber: 2, fullName: "Nguyễn Văn An" }),
        row({ rowNumber: 3, fullName: "Nguyễn Văn Em" })
      ],
      classes: [activeClass],
      existingStudents: []
    });

    assert.equal(preview.summary.errorCount, 0);
    for (const previewRow of preview.rows) {
      const codes = new Set(previewRow.issues.map((issue) => issue.code));
      assert.ok(codes.has("PHONE_DUPLICATE_IN_FILE"));
      assert.ok(codes.has("PHONE_CLASS_MEMO_COLLISION"));
    }
  });

  test("blocks a duplicated enrollment for the same student and class in the payload", () => {
    const preview = buildStudentImportPreview({
      rows: [row({ rowNumber: 2 }), row({ rowNumber: 3 })],
      classes: [activeClass],
      existingStudents: []
    });

    assert.ok(
      preview.rows.every((previewRow) =>
        previewRow.issues.some((issue) => issue.code === "DUPLICATE_ENROLLMENT_IN_PAYLOAD")
      )
    );
  });

  test("does not merge students whose Vietnamese names differ only by diacritics", () => {
    const preview = buildStudentImportPreview({
      rows: [
        row({ rowNumber: 2, fullName: "Trần Hòa" }),
        row({ rowNumber: 3, fullName: "Trần Hoa" })
      ],
      classes: [activeClass],
      existingStudents: [
        {
          id: "student-hoa-diacritic",
          fullName: "Trần Hòa",
          phone: "0912345678",
          archivedAt: null,
          enrollments: []
        }
      ]
    });

    assert.equal(preview.rows[0].existingStudentId, "student-hoa-diacritic");
    assert.equal(preview.rows[1].existingStudentId, null);
    assert.ok(
      preview.rows.every(
        (previewRow) =>
          !previewRow.issues.some(
            (issue) =>
              issue.code === "DUPLICATE_ENROLLMENT_IN_PAYLOAD" ||
              issue.code === "STUDENT_PROFILE_CONFLICT"
          )
      )
    );
  });

  test("validates the advertised 500-row batch without truncation", () => {
    const rows = Array.from({ length: 500 }, (_, index) =>
      row({
        rowNumber: index + 2,
        fullName: `Học sinh ${index + 1}`,
        phone: `09${String(index).padStart(8, "0")}`
      })
    );
    const preview = buildStudentImportPreview({
      rows,
      classes: [activeClass],
      existingStudents: []
    });

    assert.equal(preview.summary.totalRows, 500);
    assert.equal(preview.summary.errorCount, 0);
    assert.equal(preview.summary.warningCount, 0);
  });

  test("reuses an active exact-match student but blocks an archived exact match", () => {
    const existing = {
      id: "student-existing",
      fullName: "Nguyễn Văn An",
      phone: "0912345678",
      archivedAt: null,
      enrollments: [{ classId: activeClass.id }]
    };
    const reusable = buildStudentImportPreview({
      rows: [row()],
      classes: [activeClass],
      existingStudents: [existing]
    });

    assert.equal(reusable.rows[0].existingStudentId, existing.id);
    assert.ok(
      reusable.rows[0].issues.some((issue) => issue.code === "EXISTING_STUDENT_REUSED")
    );
    assert.ok(
      reusable.rows[0].issues.some((issue) => issue.code === "ENROLLMENT_ALREADY_EXISTS")
    );
    assert.equal(reusable.summary.errorCount, 0);

    const archived = buildStudentImportPreview({
      rows: [row()],
      classes: [activeClass],
      existingStudents: [{ ...existing, archivedAt: new Date() }]
    });
    assert.ok(archived.rows[0].issues.some((issue) => issue.code === "STUDENT_ARCHIVED"));
    assert.equal(archived.rows[0].existingStudentId, null);
  });
});
