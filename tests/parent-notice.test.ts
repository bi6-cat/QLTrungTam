import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildParentNotice, swapReasonLine } from "../src/lib/parent-notice";

const base = {
  className: "K26 - Tiếng Anh 10",
  payUrl: "https://aplus.zett.io.vn/pay/abc",
  month: 11,
  year: 2026,
  rows: [
    { status: "unpaid", sessions: 7 },
    { status: "paid", sessions: 7 }
  ],
  adjustmentNote: "đã trừ 2 buổi nghỉ: 09/11 GV bận, 20/11 nghỉ lễ"
};

describe("buildParentNotice", () => {
  test("uses the fixed layout with the reason after the session count", () => {
    assert.equal(
      buildParentNotice(base),
      [
        "THÔNG BÁO HỌC PHÍ THÁNG 11/2026 – LỚP K26 TIẾNG ANH 10",
        "",
        "Kính gửi Quý phụ huynh và các em @All,",
        "",
        "• Số buổi tháng 11: 7 buổi (đã trừ 2 buổi nghỉ: 09/11 GV bận, 20/11 nghỉ lễ)",
        "• Link thanh toán: https://aplus.zett.io.vn/pay/abc",
        "",
        "Hướng dẫn: Mở link → Chọn tên học sinh → Kiểm tra số tiền → Quét QR."
      ].join("\n")
    );
  });

  test("pads single-digit months in the heading", () => {
    assert.match(buildParentNotice({ ...base, month: 9 }), /^THÔNG BÁO HỌC PHÍ THÁNG 09\/2026/);
  });

  test("drops the parentheses when there is no reason", () => {
    const message = buildParentNotice({ ...base, adjustmentNote: "  " });
    assert.match(message, /• Số buổi tháng 11: 7 buổi\n• Link thanh toán/);
  });

  test("uses a separate note line when students have different session counts", () => {
    const message = buildParentNotice({ ...base, rows: [{ status: "unpaid", sessions: 9 }, { status: "unpaid", sessions: 8 }] });
    assert.doesNotMatch(message, /Số buổi tháng/);
    assert.match(message, /\n• Ghi chú: đã trừ 2 buổi nghỉ: 09\/11 GV bận, 20\/11 nghỉ lễ\n• Link thanh toán/);
  });

  test("ignores students who are not billed when counting sessions", () => {
    const message = buildParentNotice({ ...base, rows: [...base.rows, { status: "on_leave", sessions: 0 }] });
    assert.match(message, /Số buổi tháng 11: 7 buổi/);
  });
});

describe("swapReasonLine", () => {
  const message = buildParentNotice(base);

  test("replaces the old reason and keeps manual edits elsewhere", () => {
    const edited = message.replace("@All", "@All (nhóm lớp)");
    const swapped = swapReasonLine(edited, base.adjustmentNote, "GV ốm ngày 15/11");
    assert.match(swapped, /@All \(nhóm lớp\)/);
    assert.match(swapped, /• Số buổi tháng 11: 7 buổi \(GV ốm ngày 15\/11\)\n/);
    assert.doesNotMatch(swapped, /nghỉ lễ/);
  });

  test("removes the parentheses when the reason is cleared", () => {
    assert.match(swapReasonLine(message, base.adjustmentNote, ""), /• Số buổi tháng 11: 7 buổi\n/);
  });

  test("adds the reason to the session line when there was none", () => {
    const without = buildParentNotice({ ...base, adjustmentNote: "" });
    assert.match(swapReasonLine(without, "", "Lớp nghỉ lễ"), /• Số buổi tháng 11: 7 buổi \(Lớp nghỉ lễ\)\n/);
  });

  test("inserts a note line before the pay link when there is no session line", () => {
    const mixed = buildParentNotice({ ...base, adjustmentNote: "", rows: [{ status: "unpaid", sessions: 9 }, { status: "unpaid", sessions: 8 }] });
    assert.match(swapReasonLine(mixed, "", "Lớp nghỉ lễ"), /\n• Ghi chú: Lớp nghỉ lễ\n• Link thanh toán/);
  });

  test("leaves the message alone when the old reason was edited by hand", () => {
    const handEdited = message.replace("nghỉ lễ)", "lễ)");
    assert.equal(swapReasonLine(handEdited, base.adjustmentNote, "Khác"), handEdited);
  });
});
