import { describe, expect, it } from "vitest";
import { money, moneyCpm, views } from "../format";
import { dealPlatforms, dealScope } from "../types";

describe("money formatting", () => {
  it("formats whole dollars with thousands separators", () => {
    expect(money(2398)).toBe("$2,398");
    expect(money(25000)).toBe("$25,000");
    expect(money(0)).toBe("$0");
    expect(money(null)).toBe("—");
  });

  it("formats CPM with two decimals", () => {
    expect(moneyCpm(36.307)).toBe("$36.31");
    expect(moneyCpm(8)).toBe("$8.00");
    expect(moneyCpm(undefined)).toBe("—");
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
