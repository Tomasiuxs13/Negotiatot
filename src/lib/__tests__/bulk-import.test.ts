import { describe, it, expect } from "vitest";
import { normalizeBulkItem, type ProgramDefaults } from "../bulk-import";

const DEFAULTS: ProgramDefaults = {
  commissionType: "per_order",
  commissionValue: 20,
  discountType: "fixed",
  discountValue: 20,
};

const NO_DEFAULTS: ProgramDefaults = {
  commissionType: "none",
  commissionValue: 0,
  discountType: "none",
  discountValue: 0,
};

const item = (over: Record<string, unknown> = {}) => ({
  creatorName: "DonShader",
  platform: "youtube",
  ...over,
});

describe("normalizeBulkItem", () => {
  it("maps a full row into the form's field names", () => {
    const r = normalizeBulkItem(
      item({
        email: "donshdr@gmail.com",
        deliverables: "1x YouTube integration",
        campaign: "Ryoko Pro — Wave 3",
        channelUrl: "https://youtube.com/@DonShader",
        knownAvgViews: 1419,
        stage: "contacted",
      }),
      NO_DEFAULTS
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.fields).toMatchObject({
      creator: "DonShader",
      stage: "contacted",
      email: "donshdr@gmail.com",
      channel_url: "https://youtube.com/@DonShader",
      known_avg_views: "1419",
    });
    expect(r.platforms).toEqual(["youtube"]);
  });

  it("defaults stage to contacted — the import exists for outreach capture", () => {
    const r = normalizeBulkItem(item(), NO_DEFAULTS);
    expect(r.ok && r.fields.stage).toBe("contacted");
  });

  it("refuses analyzing — a file import must never silently start model runs", () => {
    const r = normalizeBulkItem(item({ stage: "analyzing" }), NO_DEFAULTS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("analysis is run from the deal page");
  });

  it("requires a creator name and a real platform", () => {
    expect(normalizeBulkItem({ platform: "youtube" }, NO_DEFAULTS).ok).toBe(false);
    const bad = normalizeBulkItem(item({ platform: "myspace" }), NO_DEFAULTS);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.creatorName).toBe("DonShader");
  });

  it("fills commission and discount from the Playbook when the row omits them", () => {
    const r = normalizeBulkItem(item(), DEFAULTS);
    if (!r.ok) throw new Error(r.error);
    expect(r.fields.commission_type).toBe("per_order");
    expect(r.fields.commission_value).toBe("20");
    expect(r.fields.discount_type).toBe("fixed");
  });

  it("treats an explicit zero as an opt-out, not an omission", () => {
    const r = normalizeBulkItem(item({ commissionValue: 0 }), DEFAULTS);
    if (!r.ok) throw new Error(r.error);
    expect(r.fields.commission_value).toBe("");
  });

  it('understands "off" as a fixed discount — how people naturally write "$20 off"', () => {
    const r = normalizeBulkItem(
      item({ audienceDiscountType: "off", audienceDiscountValue: 20 }),
      NO_DEFAULTS
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.fields.discount_type).toBe("fixed");
    expect(r.fields.discount_value).toBe("20");
  });

  it("passes a comma engagement rate through for the shared parser", () => {
    const r = normalizeBulkItem(item({ knownEngagement: "4,8" }), NO_DEFAULTS);
    expect(r.ok && r.fields.known_engagement).toBe("4,8");
  });

  it("accepts a platforms array and keeps the first as primary", () => {
    const r = normalizeBulkItem(
      item({ platform: undefined, platforms: ["TikTok", "instagram"] }),
      NO_DEFAULTS
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.platforms).toEqual(["tiktok", "instagram"]);
    expect(r.fields.primary_platform).toBe("tiktok");
  });

  it("rejects non-objects with a readable reason", () => {
    expect(normalizeBulkItem("DonShader", NO_DEFAULTS).ok).toBe(false);
    expect(normalizeBulkItem(null, NO_DEFAULTS).ok).toBe(false);
  });
});
