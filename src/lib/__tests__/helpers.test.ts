import { describe, expect, it } from "vitest";
import { euro, euroCpm, views } from "../format";
import { dealPlatforms, dealScope } from "../types";

describe("money formatting", () => {
  it("formats whole euros with thousands separators", () => {
    expect(euro(2398)).toBe("€2,398");
    expect(euro(25000)).toBe("€25,000");
    expect(euro(0)).toBe("€0");
    expect(euro(null)).toBe("—");
  });

  it("formats CPM with two decimals", () => {
    expect(euroCpm(36.307)).toBe("€36.31");
    expect(euroCpm(8)).toBe("€8.00");
    expect(euroCpm(undefined)).toBe("—");
  });

  it("abbreviates view counts", () => {
    expect(views(96400)).toBe("96.4K");
    expect(views(1_200_000)).toBe("1.2M");
    expect(views(850)).toBe("850");
    expect(views(null)).toBe("—");
  });
});

describe("dealPlatforms", () => {
  it("parses the platforms JSON array", () => {
    expect(dealPlatforms({ platform: "youtube", platforms: '["youtube","instagram"]' })).toEqual([
      "youtube",
      "instagram",
    ]);
  });

  it("falls back to the primary platform on null, invalid JSON, or unknown entries", () => {
    expect(dealPlatforms({ platform: "tiktok", platforms: null })).toEqual(["tiktok"]);
    expect(dealPlatforms({ platform: "tiktok", platforms: "not json" })).toEqual(["tiktok"]);
    expect(dealPlatforms({ platform: "tiktok", platforms: '["myspace"]' })).toEqual(["tiktok"]);
  });
});

describe("dealScope", () => {
  it("prefers deliverables over the legacy format field", () => {
    expect(dealScope({ deliverables: "1× reel", format: "integration" })).toBe("1× reel");
    expect(dealScope({ deliverables: null, format: "integration" })).toBe("integration");
    expect(dealScope({ deliverables: null, format: null })).toBeNull();
  });
});
