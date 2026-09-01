import { describe, expect, it } from "vitest";
import { inboxBucket, normalizeIgnoredDomains } from "../email-triage";

const base = {
  accountEmail: "thomas@getryoko.com",
  ignoredDomains: ["orbio.world"],
  hasRelationshipMatch: false,
};

describe("inbox triage", () => {
  it("keeps exact and thread relationship matches in priority even across team domains", () => {
    expect(
      inboxBucket({ ...base, senderEmail: "agent@orbio.world", hasRelationshipMatch: true })
    ).toBe("priority");
  });

  it("hides team, no-reply and bulk mail", () => {
    expect(inboxBucket({ ...base, senderEmail: "colleague@orbio.world" })).toBe("noise");
    expect(inboxBucket({ ...base, senderEmail: "no-reply@accounts.google.com" })).toBe("noise");
    expect(inboxBucket({ ...base, senderEmail: "news@vendor.com", listUnsubscribe: "<url>" })).toBe("noise");
    expect(inboxBucket({ ...base, senderEmail: "person@vendor.com", labelIds: ["CATEGORY_PROMOTIONS"] })).toBe("noise");
  });

  it("puts unknown human external mail in the collapsed other bucket", () => {
    expect(inboxBucket({ ...base, senderEmail: "new.agent@agency.com" })).toBe("other");
  });
});

describe("normalizeIgnoredDomains", () => {
  it("accepts a settings string and removes duplicates or invalid entries", () => {
    expect(normalizeIgnoredDomains("@getryoko.com, orbio.world; ORBIO.WORLD bad")).toEqual([
      "getryoko.com",
      "orbio.world",
    ]);
  });
});
