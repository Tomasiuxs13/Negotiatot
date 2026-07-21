import { describe, expect, it } from "vitest";
import { applyCampaignOverrides, describeOverrides, parseOverrides } from "../campaigns";

const globalRules = {
  youtube: { maxCpmIntegration: 28, minGeoShare: 60, geoLabel: "DACH", maxPerDeal: 6000 },
  instagram: { maxCpmIntegration: 18, minGeoShare: 60, geoLabel: "DACH", maxPerDeal: 4000 },
};

describe("applyCampaignOverrides", () => {
  it("replaces only the keys the campaign sets, on every platform", () => {
    const merged = applyCampaignOverrides(globalRules, { geoLabel: "SE Asia", minGeoShare: 40 });
    expect(merged.youtube).toEqual({
      maxCpmIntegration: 28, // inherited
      minGeoShare: 40, // overridden
      geoLabel: "SE Asia", // overridden
      maxPerDeal: 6000, // inherited
    });
    expect(merged.instagram).toMatchObject({ geoLabel: "SE Asia", maxCpmIntegration: 18 });
  });

  it("returns the original rules when there are no overrides", () => {
    expect(applyCampaignOverrides(globalRules, {})).toBe(globalRules);
  });

  it("ignores blank and nullish override values rather than wiping rules", () => {
    const merged = applyCampaignOverrides(globalRules, {
      geoLabel: "",
      minGeoShare: undefined,
      maxCpmIntegration: 35,
    });
    expect(merged.youtube).toMatchObject({
      geoLabel: "DACH", // untouched by the blank string
      minGeoShare: 60,
      maxCpmIntegration: 35,
    });
  });

  it("allows a zero geo floor (global campaigns)", () => {
    const merged = applyCampaignOverrides(globalRules, { minGeoShare: 0, geoLabel: "Global" });
    expect(merged.youtube).toMatchObject({ minGeoShare: 0, geoLabel: "Global" });
  });

  it("leaves platforms with no configured rules alone", () => {
    const merged = applyCampaignOverrides({ tiktok: null }, { maxPerDeal: 999 });
    expect(merged.tiktok).toBeNull();
  });
});

describe("parseOverrides", () => {
  it("parses stored JSON and tolerates junk", () => {
    expect(parseOverrides('{"minGeoShare":25}')).toEqual({ minGeoShare: 25 });
    expect(parseOverrides(null)).toEqual({});
    expect(parseOverrides("not json")).toEqual({});
    expect(parseOverrides("[1,2]")).toEqual([1, 2]); // arrays are objects; merge ignores them harmlessly
  });
});

describe("describeOverrides", () => {
  it("lists only the fields actually set, with readable labels", () => {
    expect(describeOverrides({ geoLabel: "Global", minGeoShare: 0 })).toEqual([
      "Target geo: Global",
      "Min geo share (%): 0",
    ]);
    expect(describeOverrides({})).toEqual([]);
  });
});
