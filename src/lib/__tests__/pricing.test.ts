import { describe, expect, it } from "vitest";
import {
  clampDiscountPct,
  computeNumbers,
  effectiveMaxPerDeal,
  formatFor,
  MAX_QUALITY_DISCOUNT_PCT,
  type PricingRules,
} from "../pricing";

/** A deliberately plain playbook, written out rather than imported so a change to the
 *  shipped defaults can't silently move these expectations. */
const RULES: PricingRules = {
  rulesByPlatform: {
    youtube: { maxCpmIntegration: 28, maxCpmShort: 12, maxPerDeal: 6000, minIntegrations: 1 },
    instagram: { maxCpmIntegration: 18, maxCpmShort: 8, maxPerDeal: 4000, minIntegrations: 2 },
    tiktok: { maxCpmIntegration: 10, maxCpmShort: 6, maxPerDeal: 3000, minIntegrations: 3 },
  },
  negotiationStyle: { anchorBelowTargetPct: [12, 15] },
  globalRules: {},
  unitEconomics: { aov: 100, grossMargin: 60, repeatFactor: 1, productCost: 0 },
};

describe("formatFor", () => {
  it("prices an unqualified YouTube deliverable as an integration", () => {
    expect(formatFor("1 video", "youtube")).toBe("integration");
  });

  it("prices TikTok as a short even with no format words", () => {
    expect(formatFor(null, "tiktok")).toBe("short");
  });

  it("scopes the format to the platform it is attached to", () => {
    // The string contains "reels", but the YouTube piece is still an integration.
    const text = "1× YouTube integration + 2 IG reels";
    expect(formatFor(text, "youtube")).toBe("integration");
    expect(formatFor(text, "instagram")).toBe("short");
  });
});

describe("effectiveMaxPerDeal", () => {
  it("takes the tightest cap across the platforms in the deal", () => {
    expect(effectiveMaxPerDeal(["youtube", "tiktok"], RULES)).toBe(3000);
  });

  it("lets a global cap win when it is tighter still", () => {
    expect(
      effectiveMaxPerDeal(["youtube"], { ...RULES, globalRules: { maxPerDeal: 1500 } })
    ).toBe(1500);
  });

  it("returns null when nothing caps the deal", () => {
    expect(effectiveMaxPerDeal(["youtube"], { ...RULES, rulesByPlatform: { youtube: {} } })).toBeNull();
  });
});

describe("computeNumbers", () => {
  it("values a single placement at the playbook's ceiling CPM", () => {
    const n = computeNumbers(
      { platforms: ["youtube"], blendedViews: 100_000, pieces: 1, deliverablesText: "1 video" },
      RULES
    );
    // 100,000 / 1000 × $28 = $2,800
    expect(n.fairValue).toBe(2800);
    expect(n.walkaway).toBe(2800);
    expect(n.target).toBe(2800);
    // Anchor uses the midpoint of [12, 15] = 13.5%
    expect(n.anchor).toBe(Math.round(2800 * 0.865));
    expect(n.capApplied).toBe(false);
  });

  it("multiplies by the bundle size", () => {
    const n = computeNumbers(
      { platforms: ["youtube"], blendedViews: 50_000, pieces: 3, deliverablesText: "3 videos" },
      RULES
    );
    expect(n.fairValue).toBe(4200); // 50k × $28 / 1000 = $1,400, × 3
  });

  it("prices a crosspost once across summed reach, not per platform", () => {
    const inputs = {
      platforms: ["youtube", "instagram"],
      reachByPlatform: { youtube: 100_000, instagram: 50_000 },
      pieces: 3,
      deliverablesText: "one short, crossposted",
      crosspost: true,
    };
    const n = computeNumbers(inputs, RULES);
    // Shorts: YT 100k × $12 = $1,200; IG 50k × $8 = $400. One production, so no ×3.
    expect(n.fairValue).toBe(1600);
  });

  it("caps the walk-away at maxPerDeal without touching fair value", () => {
    const n = computeNumbers(
      { platforms: ["youtube"], blendedViews: 1_000_000, pieces: 1, deliverablesText: "1 video" },
      RULES
    );
    expect(n.fairValue).toBe(28_000);
    expect(n.walkaway).toBe(6000);
    expect(n.capApplied).toBe(true);
    expect(n.workings.join(" ")).toContain("maxPerDeal caps");
  });

  it("applies the quality discount to target but never to walk-away", () => {
    const base = { platforms: ["youtube"], blendedViews: 100_000, pieces: 1, deliverablesText: "1 video" };
    const n = computeNumbers({ ...base, qualityDiscountPct: 25 }, RULES);
    expect(n.target).toBe(2100); // $2,800 less 25%
    expect(n.walkaway).toBe(2800); // unchanged — what the deal can bear, not what it should cost
    expect(n.anchor).toBeLessThan(n.target);
  });

  it("never lets target exceed walk-away when the cap bites", () => {
    const n = computeNumbers(
      {
        platforms: ["youtube"],
        blendedViews: 1_000_000,
        pieces: 1,
        deliverablesText: "1 video",
        qualityDiscountPct: 0,
      },
      RULES
    );
    expect(n.target).toBeLessThanOrEqual(n.walkaway);
  });

  it("floors breakeven at zero rather than reporting a loss as a fee", () => {
    const n = computeNumbers(
      { platforms: ["youtube"], blendedViews: 10_000, pieces: 1, expectedOrders: 1 },
      { ...RULES, unitEconomics: { aov: 100, grossMargin: 10, repeatFactor: 1, productCost: 500 } }
    );
    expect(n.breakeven).toBe(0);
  });

  it("degrades to zero rather than guessing when no reach is known", () => {
    const n = computeNumbers({ platforms: ["youtube"], blendedViews: null, pieces: 1 }, RULES);
    expect(n.fairValue).toBe(0);
    expect(n.walkaway).toBe(0);
    expect(n.perPlatform).toHaveLength(0);
    expect(n.workings.join(" ")).toContain("No reach on record");
  });
});

describe("quality discount is a bounded input, not an open one", () => {
  it("clamps to the documented maximum", () => {
    expect(clampDiscountPct(95)).toBe(MAX_QUALITY_DISCOUNT_PCT);
    expect(clampDiscountPct(-10)).toBe(0);
    expect(clampDiscountPct(null)).toBe(0);
    expect(clampDiscountPct(Number.NaN)).toBe(0);
  });

  /**
   * The reason the clamp exists. Moving the four numbers into code closes the direct
   * route — a report can no longer overwrite walk-away — but an unbounded discount would
   * reopen it one step further back, collapsing the target just as effectively.
   */
  it("a 95% discount smuggled in from a report cannot collapse the target", () => {
    const n = computeNumbers(
      {
        platforms: ["youtube"],
        blendedViews: 100_000,
        pieces: 1,
        deliverablesText: "1 video",
        qualityDiscountPct: 95,
      },
      RULES
    );
    expect(n.qualityDiscountPct).toBe(50);
    expect(n.target).toBe(1400); // half of $2,800, not 5% of it
    expect(n.walkaway).toBe(2800);
  });
});

/**
 * Playbook isolation.
 *
 * The multi-brand failure this guards against does not look like a bug: a leaked playbook
 * produces a perfectly plausible recommendation, just one computed against a competitor's
 * economics. Same creator, same reach — only the rules differ, and every number must
 * follow the rules it was given.
 */
describe("playbook isolation", () => {
  const premiumBrand: PricingRules = {
    rulesByPlatform: { youtube: { maxCpmIntegration: 40, maxPerDeal: 20_000 } },
    negotiationStyle: { anchorBelowTargetPct: [10] },
    unitEconomics: { aov: 300, grossMargin: 70, repeatFactor: 2, productCost: 0 },
  };
  const thriftyBrand: PricingRules = {
    rulesByPlatform: { youtube: { maxCpmIntegration: 8, maxPerDeal: 1000 } },
    negotiationStyle: { anchorBelowTargetPct: [20] },
    unitEconomics: { aov: 30, grossMargin: 20, repeatFactor: 1, productCost: 10 },
  };
  const sameDeal = {
    platforms: ["youtube"],
    blendedViews: 200_000,
    pieces: 1,
    deliverablesText: "1 video",
    expectedOrders: 40,
  };

  it("prices the identical creator differently under each brand's rules", () => {
    const premium = computeNumbers(sameDeal, premiumBrand);
    const thrifty = computeNumbers(sameDeal, thriftyBrand);

    expect(premium.fairValue).toBe(8000); // 200k × $40 / 1000
    expect(thrifty.fairValue).toBe(1600); // 200k × $8 / 1000

    expect(premium.walkaway).toBe(8000);
    expect(thrifty.walkaway).toBe(1000); // its own tighter maxPerDeal

    // No number produced under one brand may equal the other's, or the rules didn't travel.
    expect(premium.anchor).not.toBe(thrifty.anchor);
    expect(premium.breakeven).not.toBe(thrifty.breakeven);
  });

  it("keeps each brand's anchoring step", () => {
    expect(computeNumbers(sameDeal, premiumBrand).anchor).toBe(Math.round(8000 * 0.9));
    expect(computeNumbers(sameDeal, thriftyBrand).anchor).toBe(Math.round(1000 * 0.8));
  });

  it("does not carry state between calls", () => {
    const first = computeNumbers(sameDeal, premiumBrand);
    computeNumbers(sameDeal, thriftyBrand);
    const again = computeNumbers(sameDeal, premiumBrand);
    expect(again).toEqual(first);
  });
});
