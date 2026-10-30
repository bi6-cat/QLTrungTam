import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { LearningError } from "../src/modules/learning/errors";
import { checkMaterialInput, materialHost, normalizeMaterialUrl } from "../src/modules/learning/materials";

describe("normalizeMaterialUrl", () => {
  test("adds https:// when the teacher pastes a bare address", () => {
    assert.equal(normalizeMaterialUrl("  drive.google.com/file/d/abc/view "), "https://drive.google.com/file/d/abc/view");
    assert.equal(normalizeMaterialUrl("http://example.com/a?b=1"), "http://example.com/a?b=1");
    assert.equal(normalizeMaterialUrl("HTTPS://YouTube.com/watch?v=x"), "https://youtube.com/watch?v=x");
    assert.equal(normalizeMaterialUrl("   "), null);
  });

  test("rejects links students should not click straight into", () => {
    for (const bad of ["javascript:alert(1)", "javascript://%0aalert(1)", "data:text/html,<b>x</b>", "ftp://example.com/x", "file:///etc/passwd", "localhost:3000", "khong phai link", "https://"]) {
      assert.throws(() => normalizeMaterialUrl(bad), LearningError, bad);
    }
    assert.throws(() => normalizeMaterialUrl(`https://example.com/${"a".repeat(2000)}`), /quá dài/);
  });
});

describe("checkMaterialInput", () => {
  test("needs a title and at least a link or a note", () => {
    assert.throws(() => checkMaterialInput({ title: " ", url: "example.com", note: "" }), /tên tài liệu/);
    assert.throws(() => checkMaterialInput({ title: "Đề cương", url: "", note: "  " }), /đường dẫn tài liệu hoặc viết ghi chú/);
    assert.throws(() => checkMaterialInput({ title: "x".repeat(121), url: "example.com", note: "" }), /120/);
    assert.throws(() => checkMaterialInput({ title: "Ghi chú dài", url: "", note: "x".repeat(2001) }), /2000/);
  });

  test("trims and normalizes what it keeps", () => {
    assert.deepEqual(checkMaterialInput({ title: "  Bài đọc  ", url: "", note: " Làm trang 12\r\nvà 13 " }), {
      title: "Bài đọc",
      url: null,
      note: "Làm trang 12\nvà 13"
    });
    assert.deepEqual(checkMaterialInput({ title: "Video", url: "youtu.be/x", note: "" }), { title: "Video", url: "https://youtu.be/x", note: "" });
  });
});

test("materialHost shows the site name without www", () => {
  assert.equal(materialHost("https://www.youtube.com/watch?v=x"), "youtube.com");
  assert.equal(materialHost("https://drive.google.com/x"), "drive.google.com");
  assert.equal(materialHost("not a url"), "");
});
