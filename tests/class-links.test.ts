import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  classLinkSlug,
  LEGACY_CLASS_LINKS_UNTIL,
  legacyClassLinksActive,
  parseClassLinkSlug,
  payPath,
  teacherPath
} from "../src/lib/class-links";

describe("class link slugs", () => {
  test("puts the class code in front of the random token", () => {
    assert.equal(classLinkSlug("l10a", "k7m2x9pq4r"), "L10A-k7m2x9pq4r");
    assert.equal(payPath({ shortCode: "L10A", publicToken: "k7m2x9pq4r" }), "/pay/L10A-k7m2x9pq4r");
    assert.equal(
      teacherPath({ shortCode: "L10A", teacherToken: "abcdefghjkmnpqrs" }),
      "/teacher/classes/L10A-abcdefghjkmnpqrs"
    );
  });

  test("splits on the last dash so class codes may contain dashes", () => {
    assert.deepEqual(parseClassLinkSlug("HOA_12-A-k7m2x9pq4r"), {
      shortCode: "HOA_12-A",
      token: "k7m2x9pq4r"
    });
    assert.deepEqual(parseClassLinkSlug("l10a-K7M2X9PQ4R"), { shortCode: "L10A", token: "k7m2x9pq4r" });
  });

  test("treats slugs without a dash as legacy links", () => {
    assert.equal(parseClassLinkSlug("ab3d"), null);
    assert.equal(parseClassLinkSlug("-abc"), null);
    assert.equal(parseClassLinkSlug("L10A-"), null);
    assert.equal(parseClassLinkSlug("%E0%A4%A"), null);
  });

  test("keeps legacy links only until the end of November 2026 (Vietnam time)", () => {
    assert.equal(legacyClassLinksActive(new Date("2026-11-30T16:59:59.000Z")), true);
    assert.equal(legacyClassLinksActive(LEGACY_CLASS_LINKS_UNTIL), false);
    assert.equal(legacyClassLinksActive(new Date("2027-01-01T00:00:00.000Z")), false);
  });
});
