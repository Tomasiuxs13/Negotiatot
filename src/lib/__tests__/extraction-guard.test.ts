import { describe, it, expect } from "vitest";
import { describeExtraction, isExtractionUsable, type ExtractedReport } from "../extraction";

const base = (over: Partial<ExtractedReport> = {}): ExtractedReport => ({
  avgViews: 79000,
  avgViewsBasis: "last 30 long-form videos",
  engagementRatePct: 3.7,
  followers: 445000,
  audienceGeoTopShares: [{ country: "US", sharePct: 62 }],
  fakeFollowerPct: 8,
  viewsTrendPct: -4.8,
  viewsTrendBasis: "likes per post, last 30 days",
  rateCardFigures: [],
  channelUrl: null,
  notableSignals: [],
  missingFields: [],
  ...over,
});

describe("isExtractionUsable", () => {
  it("accepts a well-formed extraction", () => {
    expect(isExtractionUsable(base())).toBe(true);
  });

  it("rejects null and an extraction with no headline figures at all", () => {
    expect(isExtractionUsable(null)).toBe(false);
    expect(
      isExtractionUsable(base({ avgViews: null, followers: null, engagementRatePct: null }))
    ).toBe(false);
  });

  it("still runs when only some figures were found — partial is not useless", () => {
    expect(isExtractionUsable(base({ avgViews: 12000, followers: null, engagementRatePct: null }))).toBe(
      true
    );
  });

  it("rejects impossible percentages rather than grading against them", () => {
    expect(isExtractionUsable(base({ engagementRatePct: 900 }))).toBe(false);
    expect(isExtractionUsable(base({ fakeFollowerPct: -3 }))).toBe(false);
  });

  it("rejects zero or negative views, which would zero every number downstream", () => {
    expect(isExtractionUsable(base({ avgViews: 0 }))).toBe(false);
    expect(isExtractionUsable(base({ avgViews: -100 }))).toBe(false);
  });

  it("catches a K/M suffix misread — views two orders of magnitude over followers", () => {
    // 13.5K read as 13,500,000 against 110k followers is the realistic failure here.
    expect(isExtractionUsable(base({ avgViews: 13_500_000, followers: 110_000 }))).toBe(false);
    // But genuine Shorts virality (views above followers) must still pass.
    expect(isExtractionUsable(base({ avgViews: 300_000, followers: 110_000 }))).toBe(true);
  });
});

describe("describeExtraction", () => {
  it("states absences as unknown so they cannot be read as zero", () => {
    const text = describeExtraction(
      base({ fakeFollowerPct: null, missingFields: ["fake follower %", "audience geo"] })
    );
    expect(text).toContain("NOT in the report");
    expect(text).toContain("fake follower %");
    expect(text).not.toContain("Fake followers: 0");
  });

  it("carries the basis of the average, since a blended figure means something else", () => {
    expect(describeExtraction(base())).toContain("last 30 long-form videos");
  });

  it("qualifies a trend, and flags it when the basis is missing", () => {
    expect(describeExtraction(base())).toContain("likes per post, last 30 days");
    expect(describeExtraction(base({ viewsTrendBasis: null }))).toContain("treat with caution");
  });

  it("attaches the source text to each figure, so a mis-mapping is visible in the prompt", () => {
    const text = describeExtraction(
      base({
        viewsTrendPct: 233.08,
        viewsTrendBasis: null,
        fieldSources: [{ field: "viewsTrendPct", quote: "Account growth rate 233.08% yearly" }],
      })
    );
    // The real failure: a follower growth rate landing in the views trend. With the
    // quote attached, the model doing the reasoning can see the label disagrees.
    expect(text).toContain('read from: "Account growth rate 233.08% yearly"');
  });

  it("omits the provenance clause for figures with no recorded source", () => {
    expect(describeExtraction(base({ fieldSources: [] }))).not.toContain("read from");
  });

  it("carries qualitative signals the fixed fields would have discarded", () => {
    const text = describeExtraction(
      base({ notableSignals: ["Report flags comment authenticity as low"] })
    );
    expect(text).toContain("comment authenticity");
  });
});
