import { describe, expect, it } from "vitest";
import {
  deliverableCount,
  deliverableCountsByPlatform,
  provisionalDeliverables,
} from "../deliverables";

const rules = {
  youtube: { minIntegrations: 3 },
  instagram: { minIntegrations: 2 },
  tiktok: { minIntegrations: 3 },
};

describe("deliverableCount", () => {
  it("reads a count out of the deliverables text", () => {
    expect(deliverableCount({ text: "3 YouTube integrations" })).toBe(3);
    expect(deliverableCount({ text: "2x Reels" })).toBe(2);
    expect(deliverableCount({ text: "1 × video" })).toBe(1);
  });

  it("sums a multi-platform bundle", () => {
    expect(deliverableCount({ text: "2 videos + 3 stories" })).toBe(5);
  });

  it("ignores numbers that aren't piece counts", () => {
    // The $500 must not be read as five hundred videos.
    expect(deliverableCount({ text: "$500 for the bundle" })).toBe(1);
  });

  it("falls back to the Playbook bundle the draft will actually propose", () => {
    // The common case: an opening negotiation with no deliverables agreed yet. Quoting
    // one video's earnings against the three-video ask would understate by 3×.
    expect(
      deliverableCount({ text: null, platforms: ["youtube"], rulesByPlatform: rules })
    ).toBe(3);
  });

  it("takes the largest single-platform minimum on a multi-platform deal, not the sum", () => {
    // Several platforms with nothing written down may be one piece crossposted
    // everywhere — summing the minimums priced a single crossposted Short as six
    // productions. Max is right for a crosspost, merely conservative for a true bundle.
    expect(
      deliverableCount({ platforms: ["youtube", "instagram"], rulesByPlatform: rules })
    ).toBe(3);
    expect(
      deliverableCount({
        platforms: ["youtube", "tiktok", "instagram"],
        rulesByPlatform: rules,
      })
    ).toBe(3);
  });

  it("prefers an explicit count over the Playbook fallback", () => {
    expect(
      deliverableCount({ text: "1 video", platforms: ["youtube"], rulesByPlatform: rules })
    ).toBe(1);
  });

  it("is one piece when there is nothing to go on", () => {
    expect(deliverableCount({})).toBe(1);
    expect(deliverableCount({ text: "", platforms: ["youtube"] })).toBe(1);
  });
});

describe("provisionalDeliverables", () => {
  it("expands an unambiguous platform-qualified scope", () => {
    expect(
      provisionalDeliverables(
        "1 YouTube integration + 2 Instagram reels",
        ["youtube", "instagram"]
      )
    ).toEqual({
      items: [
        { title: "YouTube integration", platform: "youtube" },
        { title: "Instagram reels (1/2)", platform: "instagram" },
        { title: "Instagram reels (2/2)", platform: "instagram" },
      ],
      reason: null,
    });
  });

  it("inherits the only platform when the scope is unqualified", () => {
    expect(provisionalDeliverables("2 reels", ["instagram"]).items).toEqual([
      { title: "reels (1/2)", platform: "instagram" },
      { title: "reels (2/2)", platform: "instagram" },
    ]);
  });

  it("refuses to guess an unqualified mixed-platform item", () => {
    const result = provisionalDeliverables(
      "1 YouTube integration + 1 story",
      ["youtube", "instagram"]
    );
    expect(result.items).toEqual([]);
    expect(result.reason).toContain("Name a platform");
  });

  it("leaves a mixed-platform crosspost for manager confirmation", () => {
    const result = provisionalDeliverables(
      "1 short cross-posted to YouTube and Instagram",
      ["youtube", "instagram"]
    );
    expect(result.items).toEqual([]);
    expect(result.reason).toContain("Cross-posted");
  });
});

describe("deliverableCountsByPlatform", () => {
  it("keeps each platform's quantity separate", () => {
    expect(
      deliverableCountsByPlatform(
        "1 YouTube integration + 2 IG reels + 1 TikTok short",
        ["youtube", "instagram", "tiktok"]
      )
    ).toEqual({ youtube: 1, instagram: 2, tiktok: 1 });
  });

  it("does not guess an unqualified item onto a selected platform", () => {
    expect(
      deliverableCountsByPlatform("1 YouTube integration + 1 story", ["youtube", "instagram"])
    ).toEqual({ youtube: 1 });
  });
});
