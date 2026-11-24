import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { birthYearForGrade, estimateBirthYear, gradeFromClassName, schoolYearStart } from "../src/lib/birth-year";

describe("gradeFromClassName", () => {
  test("reads the grade at the end of the class name", () => {
    assert.equal(gradeFromClassName("K26 - Toán 12"), 12);
    assert.equal(gradeFromClassName("K26 - Tiếng Anh 9"), 9);
    assert.equal(gradeFromClassName("Văn 10A"), 10);
  });

  test("ignores names without a 1–12 grade", () => {
    assert.equal(gradeFromClassName("K26"), null);
    assert.equal(gradeFromClassName("Luyện thi IELTS"), null);
    assert.equal(gradeFromClassName("Lớp 123"), null);
  });
});

describe("birth year estimate", () => {
  const november2026 = new Date("2026-11-24T03:00:00Z");
  const march2027 = new Date("2027-03-10T03:00:00Z");

  test("school year starts in August", () => {
    assert.equal(schoolYearStart(november2026), 2026);
    assert.equal(schoolYearStart(march2027), 2026);
    assert.equal(schoolYearStart(new Date("2027-08-01T03:00:00Z")), 2027);
  });

  test("grade 10 in school year 2026–2027 was born in 2011", () => {
    assert.equal(birthYearForGrade(10, november2026), 2011);
    assert.equal(birthYearForGrade(10, march2027), 2011);
    assert.equal(birthYearForGrade(12, november2026), 2009);
  });

  test("uses the highest grade across current classes", () => {
    assert.equal(estimateBirthYear(["K26 - Văn 9", "K26 - Toán 10"], november2026), 2011);
    assert.equal(estimateBirthYear(["Luyện thi IELTS"], november2026), null);
  });
});
