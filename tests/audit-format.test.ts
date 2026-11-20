import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { diffFields } from "../src/lib/audit";
import { actionPrefixesForGroup, describeAudit, describeChanges } from "../src/lib/audit-format";

describe("diffFields", () => {
  test("keeps only changed fields, treating undefined as null", () => {
    assert.deepEqual(diffFields({ sessions: 8, status: "active", note: null }, { sessions: 7, status: "active", note: undefined }), {
      sessions: { from: 8, to: 7 }
    });
  });

  test("returns empty object when nothing changed", () => {
    assert.deepEqual(diffFields({ phone: "0901" }, { phone: "0901" }), {});
  });
});

describe("describeAudit", () => {
  test("month plan change shows period, sessions and invoice amount", () => {
    const { title, details } = describeAudit({
      action: "month_plan.updated",
      reason: null,
      metadata: { month: 11, year: 2026, changes: { sessions: { from: 8, to: 7 } }, amountFrom: 800000, amountTo: 700000 }
    });
    assert.equal(title, "Sửa số buổi / tình trạng tháng");
    assert.deepEqual(details, ["T11/2026", "Hóa đơn: 800.000đ → 700.000đ", "Số buổi: 8 → 7"]);
  });

  test("status and money fields are translated", () => {
    assert.deepEqual(
      describeChanges({ status: { from: "active", to: "on_leave" }, pricePerSession: { from: 100000, to: 120000 }, note: { from: null, to: "x" } }),
      ["Tình trạng: Đang học → Bảo lưu", "Học phí/buổi: 100.000đ → 120.000đ", "Ghi chú: (trống) → x"]
    );
  });

  test("enrollment dates are shown in Vietnam time", () => {
    // 0h 01/11/2026 giờ VN lưu thành 2026-10-31T17:00Z.
    const { details } = describeAudit({
      action: "enrollment.created",
      reason: null,
      metadata: { startDate: "2026-10-31T17:00:00.000Z" }
    });
    assert.deepEqual(details, ["Bắt đầu học 01/11/2026"]);
  });

  test("reason and unknown actions", () => {
    const { title, details } = describeAudit({ action: "custom.thing", reason: "Lý do X", metadata: null });
    assert.equal(title, "custom.thing");
    assert.deepEqual(details, ["Lý do: Lý do X"]);
  });

  test("action groups", () => {
    assert.deepEqual(actionPrefixesForGroup("sessions"), ["month_plan.", "invoice."]);
    assert.equal(actionPrefixesForGroup("nope"), null);
    assert.equal(actionPrefixesForGroup(undefined), null);
  });
});
