import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { composeGroupDebtNotice, composeTuitionNotice, splitForZalo } from "../mcp/announcements";
import { editDistance, findAnomalies, findDuplicateGroups, type CheckStudent } from "../mcp/student-checks";

function student(overrides: Partial<CheckStudent> & Pick<CheckStudent, "id" | "fullName">): CheckStudent {
  return {
    phone: "0912345678",
    address: "Thái Bình",
    parentName: "Phụ huynh",
    archived: false,
    activeClassCodes: [],
    enrollmentCount: 1,
    unpaidInvoiceCount: 0,
    ...overrides
  };
}

describe("duplicate student detection", () => {
  test("flags same name and phone, ignoring accents and case", () => {
    const groups = findDuplicateGroups([
      student({ id: "a", fullName: "Nguyễn Văn An" }),
      student({ id: "b", fullName: "nguyen van an" }),
      student({ id: "c", fullName: "Trần Thị Bình", phone: "0988888888" })
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].kind, "same_name_and_phone");
    assert.equal(groups[0].severity, "high");
    assert.deepEqual(groups[0].students.map((item) => item.id).sort(), ["a", "b"]);
  });

  test("flags typo-like names that share a phone number", () => {
    const groups = findDuplicateGroups([
      student({ id: "a", fullName: "Nguyễn Văn An" }),
      student({ id: "b", fullName: "Nguyễn Văn Anh" })
    ]);

    assert.ok(groups.some((group) => group.kind === "similar_name_same_phone"));
  });

  test("treats siblings with a shared phone as fine unless they share a class", () => {
    const apart = findDuplicateGroups([
      student({ id: "a", fullName: "Lê Hoàng Nam", activeClassCodes: ["L10A"] }),
      student({ id: "b", fullName: "Lê Thu Hà", activeClassCodes: ["L9B"] })
    ]);
    assert.equal(apart.length, 0);

    const together = findDuplicateGroups([
      student({ id: "a", fullName: "Lê Hoàng Nam", activeClassCodes: ["L10A"] }),
      student({ id: "b", fullName: "Lê Thu Hà", activeClassCodes: ["L10A"] })
    ]);
    assert.equal(together.length, 1);
    assert.equal(together[0].kind, "same_phone_same_class");
  });

  test("flags the same name under different phone numbers as medium severity", () => {
    const groups = findDuplicateGroups([
      student({ id: "a", fullName: "Phạm Minh Đức", phone: "0911111111" }),
      student({ id: "b", fullName: "Phạm Minh Duc", phone: "0922222222" })
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].kind, "same_name_different_phone");
    assert.equal(groups[0].severity, "medium");
  });
});

describe("student anomaly detection", () => {
  const codes = (input: CheckStudent) => findAnomalies([input]).map((item) => item.code);

  test("accepts a clean record", () => {
    assert.deepEqual(codes(student({ id: "a", fullName: "Nguyễn Văn An" })), []);
  });

  test("flags malformed and placeholder phone numbers", () => {
    assert.ok(codes(student({ id: "a", fullName: "Nguyễn Văn An", phone: "912345678" })).includes("phone_format"));
    assert.ok(codes(student({ id: "a", fullName: "Nguyễn Văn An", phone: "00000000" })).includes("phone_placeholder"));
  });

  test("flags odd names", () => {
    assert.ok(codes(student({ id: "a", fullName: "An" })).includes("name_single_word"));
    assert.ok(codes(student({ id: "a", fullName: "Nguyen Van An 2" })).includes("name_symbols"));
    assert.ok(codes(student({ id: "a", fullName: "NGUYỄN VĂN AN" })).includes("name_case"));
  });

  test("flags enrollment and archive inconsistencies", () => {
    assert.ok(codes(student({ id: "a", fullName: "Nguyễn Văn An", enrollmentCount: 0 })).includes("no_enrollment"));
    const archived = codes(
      student({ id: "a", fullName: "Nguyễn Văn An", archived: true, activeClassCodes: ["L10A"], unpaidInvoiceCount: 2 })
    );
    assert.ok(archived.includes("archived_but_enrolled"));
    assert.ok(archived.includes("archived_with_debt"));
  });

  test("sorts the most severe findings first", () => {
    const results = findAnomalies([
      student({ id: "a", fullName: "Nguyễn Văn An", address: "" }),
      student({ id: "b", fullName: "Trần Thị Bình", phone: "123" })
    ]);
    assert.equal(results[0].severity, "high");
    assert.equal(results[results.length - 1].severity, "low");
  });
});

describe("edit distance", () => {
  test("counts single-character edits and stops early past the limit", () => {
    assert.equal(editDistance("an", "an"), 0);
    assert.equal(editDistance("an", "anh"), 1);
    assert.equal(editDistance("nguyen van an", "tran thi binh", 2), 3);
  });
});

describe("Zalo notices", () => {
  const base = {
    centerName: "APLUS ACADEMY",
    centerPhone: "0865638262",
    className: "Toán 10A",
    classShortCode: "L10A",
    payUrl: "https://example.test/pay/L10A-abc"
  };
  const debtors = [
    { studentName: "Nguyễn Văn An", totalAmount: 1_200_000, invoices: [{ month: 9, year: 2026, amount: 1_200_000, monthsOverdue: 1 }] },
    { studentName: "Trần Thị Bình", totalAmount: 800_000, invoices: [{ month: 10, year: 2026, amount: 800_000, monthsOverdue: 0 }] }
  ];

  test("lists names and amounts with the class pay link", () => {
    const notice = composeGroupDebtNotice({ ...base, period: null, debtors, detail: "names_amounts", deadline: "trước ngày 15/10" });

    assert.match(notice.message, /LỚP Toán 10A \(L10A\)/);
    assert.match(notice.message, /1\. Nguyễn Văn An — T9\/2026: 1[.\s]200[.\s]000/);
    assert.match(notice.message, /quá hạn 1 tháng/);
    assert.match(notice.message, /trước ngày 15\/10/);
    assert.match(notice.message, /https:\/\/example\.test\/pay\/L10A-abc/);
    assert.equal(notice.totalAmount, 2_000_000);
    assert.equal(notice.debtorCount, 2);
  });

  test("hides amounts when only names are requested", () => {
    const notice = composeGroupDebtNotice({ ...base, period: null, debtors, detail: "names_only" });

    assert.match(notice.message, /Nguyễn Văn An/);
    assert.doesNotMatch(notice.message, /1[.\s]200[.\s]000/);
  });

  test("hides student names in summary mode", () => {
    const notice = composeGroupDebtNotice({ ...base, period: null, debtors, detail: "summary_only" });

    assert.doesNotMatch(notice.message, /Nguyễn Văn An/);
    assert.match(notice.message, /Còn 2 học sinh/);
  });

  test("describes a single tuition plan or warns when no invoices exist", () => {
    const notice = composeTuitionNotice({ ...base, month: 10, year: 2026, plans: [{ sessions: 8, amount: 800_000, students: 12 }] });
    assert.match(notice.message, /8 buổi · 800[.\s]000/);

    const empty = composeTuitionNotice({ ...base, month: 10, year: 2026, plans: [] });
    assert.match(empty.message, /chưa có hoá đơn/);
  });

  test("splits long messages on line boundaries", () => {
    const text = Array.from({ length: 100 }, (_, index) => `Dòng số ${index} ${"x".repeat(40)}`).join("\n");
    const parts = splitForZalo(text, 500);

    assert.ok(parts.length > 1);
    assert.ok(parts.every((part) => part.length <= 500));
    assert.equal(parts.join("\n"), text);
  });
});
