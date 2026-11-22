import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildParentNotice, swapReasonLine } from "../src/lib/parent-notice";

const base = {
  className: "K26 - Tiếng Anh 9",
  payUrl: "https://aplus.zett.io.vn/pay/abc",
  month: 10,
  year: 2026,
  rows: [
    { status: "unpaid", sessions: 9 },
    { status: "paid", sessions: 9 }
  ],
  adjustmentNote: "Tháng 9 lớp nghỉ 1 buổi, trừ vào học phí tháng 10"
};

describe("buildParentNotice", () => {
  test("uses the fixed layout with sessions and reason lines", () => {
    assert.equal(
      buildParentNotice(base),
      [
        "Thông báo học phí Tháng 10/2026",
        "Kính gửi phụ huynh lớp K26 - Tiếng Anh 9, @All",
        "Tổng số buổi T10 dự kiến: 9 buổi",
        "[Tháng 9 lớp nghỉ 1 buổi, trừ vào học phí tháng 10]",
        "Xem và thanh toán: https://aplus.zett.io.vn/pay/abc",
        "Chọn tên, kiểm tra số tiền rồi quét QR (không cần sửa nội dung chuyển khoản). Hệ thống tự xác nhận khi nhận tiền."
      ].join("\n")
    );
  });

  test("drops the reason line when there is none", () => {
    const message = buildParentNotice({ ...base, adjustmentNote: "  " });
    assert.doesNotMatch(message, /\[/);
    assert.match(message, /dự kiến: 9 buổi\nXem và thanh toán/);
  });

  test("drops the sessions line when students have different session counts", () => {
    const message = buildParentNotice({ ...base, rows: [{ status: "unpaid", sessions: 9 }, { status: "unpaid", sessions: 8 }] });
    assert.doesNotMatch(message, /Tổng số buổi/);
  });

  test("ignores students who are not billed when counting sessions", () => {
    const message = buildParentNotice({ ...base, rows: [...base.rows, { status: "on_leave", sessions: 0 }] });
    assert.match(message, /dự kiến: 9 buổi/);
  });
});

describe("swapReasonLine", () => {
  const message = buildParentNotice(base);

  test("replaces the old reason line and keeps manual edits elsewhere", () => {
    const edited = message.replace("@All", "@All (nhóm lớp)");
    const swapped = swapReasonLine(edited, base.adjustmentNote, "GV ốm ngày 15/10");
    assert.match(swapped, /@All \(nhóm lớp\)/);
    assert.match(swapped, /\n\[GV ốm ngày 15\/10\]\n/);
    assert.doesNotMatch(swapped, /Tháng 9 lớp nghỉ/);
  });

  test("removes the line when the reason is cleared", () => {
    assert.doesNotMatch(swapReasonLine(message, base.adjustmentNote, ""), /\[/);
  });

  test("inserts the line before the pay link when there was no reason", () => {
    const without = buildParentNotice({ ...base, adjustmentNote: "" });
    const swapped = swapReasonLine(without, "", "Lớp nghỉ lễ");
    assert.match(swapped, /dự kiến: 9 buổi\n\[Lớp nghỉ lễ\]\nXem và thanh toán/);
  });

  test("leaves the message alone when the old reason line was deleted by hand", () => {
    const handEdited = message.split("\n").filter((line) => !line.startsWith("[")).join("\n");
    assert.equal(swapReasonLine(handEdited, base.adjustmentNote, "Khác"), handEdited);
  });
});
