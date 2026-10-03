import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { decodeSessionToken, encodeSessionToken } from "../src/lib/session-token";

describe("session token", () => {
  const payload = { userId: "u1", username: "admin", exp: Date.now() + 60_000 };

  test("round-trips a signed session", () => {
    assert.deepEqual(decodeSessionToken(encodeSessionToken(payload)), payload);
  });

  test("rejects tampered, expired and malformed tokens", () => {
    const token = encodeSessionToken(payload);
    const [, signature] = token.split(".");
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, username: "attacker" })).toString("base64url");

    assert.equal(decodeSessionToken(`${forgedBody}.${signature}`), null);
    assert.equal(decodeSessionToken(encodeSessionToken({ ...payload, exp: Date.now() - 1 })), null);
    assert.equal(decodeSessionToken("not-a-token"), null);
    assert.equal(decodeSessionToken(undefined), null);
  });
});
