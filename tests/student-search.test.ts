import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { matchesName, normalizeName, sortByGivenName } from "../src/lib/student-search";

describe("student search on the pay page", () => {
  test("matches without accents, in any case and word order", () => {
    assert.equal(normalizeName("  Vũ Phạm  Anh Khoa "), "vu pham anh khoa");
    assert.equal(normalizeName("Đỗ Đức"), "do duc");
    assert.equal(matchesName("Vũ Phạm Anh Khoa", "khoa"), true);
    assert.equal(matchesName("Vũ Phạm Anh Khoa", "KHOA vu"), true);
    assert.equal(matchesName("Nguyễn Tiến Phong", "phong nguyen"), true);
    assert.equal(matchesName("Nguyễn Tiến Phong", "phong lan"), false);
    assert.equal(matchesName("Nguyễn Tiến Phong", "   "), true);
  });

  test("sorts by given name, then by full name", () => {
    const sorted = sortByGivenName([
      { fullName: "Nguyễn Văn Bình" },
      { fullName: "Trần Thị An" },
      { fullName: "Nguyễn Hoàng An" },
      { fullName: "Lê Đức" }
    ]).map((student) => student.fullName);
    assert.deepEqual(sorted, ["Nguyễn Hoàng An", "Trần Thị An", "Nguyễn Văn Bình", "Lê Đức"]);
  });
});
