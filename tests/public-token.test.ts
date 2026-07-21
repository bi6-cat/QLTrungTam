import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { generatePublicToken, PUBLIC_TOKEN_LENGTH } from "../src/lib/publicToken";

describe("generatePublicToken", () => {
  test("uses the configured default length and unambiguous alphabet", () => {
    const token = generatePublicToken();

    assert.equal(token.length, PUBLIC_TOKEN_LENGTH);
    assert.match(token, /^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
    assert.doesNotMatch(token, /[01Oil]/);
  });

  test("honors a requested token length", () => {
    assert.equal(generatePublicToken(24).length, 24);
    assert.equal(generatePublicToken(0), "");
  });
});
