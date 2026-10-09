import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { canAccessAdminPath, parseRole } from "../src/lib/roles";

describe("admin roles", () => {
  test("owner opens every admin page", () => {
    for (const path of ["/admin", "/admin/classes", "/admin/salary", "/admin/students/abc", "/admin/settings"]) {
      assert.equal(canAccessAdminPath("owner", path), true, path);
    }
  });

  test("manager opens only the allowed sections", () => {
    for (const path of [
      "/admin",
      "/admin/classes",
      "/admin/debts",
      "/admin/transactions",
      "/admin/reports",
      "/admin/reports/export-salary",
      "/admin/settings",
      "/admin/students/abc",
      "/admin/students/abc/"
    ]) {
      assert.equal(canAccessAdminPath("manager", path), true, path);
    }
    for (const path of [
      "/admin/students",
      "/admin/students/",
      "/admin/students/abc/edit",
      "/admin/schedule",
      "/admin/finance",
      "/admin/salary",
      "/admin/debtsx",
      "/admin/classes-old"
    ]) {
      assert.equal(canAccessAdminPath("manager", path), false, path);
    }
  });

  test("tokens without a role belong to the owner", () => {
    assert.equal(parseRole(undefined), "owner");
    assert.equal(parseRole("manager"), "manager");
    assert.equal(parseRole("root"), "owner");
  });
});
