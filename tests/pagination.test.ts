import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { pageItems } from "../src/lib/pagination";

describe("pageItems", () => {
  test("ít trang thì hiện hết", () => {
    assert.deepEqual(pageItems(1, 1), [1]);
    assert.deepEqual(pageItems(2, 5), [1, 2, 3, 4, 5]);
  });

  test("nhiều trang: đầu, cuối, quanh trang hiện tại, khoảng trống thành …", () => {
    assert.deepEqual(pageItems(1, 20), [1, 2, 3, 4, "gap", 20]);
    assert.deepEqual(pageItems(10, 20), [1, "gap", 9, 10, 11, "gap", 20]);
    assert.deepEqual(pageItems(20, 20), [1, "gap", 17, 18, 19, 20]);
  });

  test("thiếu đúng một trang thì hiện số thay vì …", () => {
    assert.deepEqual(pageItems(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  });
});
