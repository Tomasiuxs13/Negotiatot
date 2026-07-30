import { describe, expect, it } from "vitest";
import { deliverableCount } from "../deliverables";

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
