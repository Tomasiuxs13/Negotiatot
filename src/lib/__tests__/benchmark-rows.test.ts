import { describe, expect, it } from "vitest";
import { benchmarkRows, platformAverages, reachKey } from "../benchmark-rows";
import type { Deal } from "../types";
import type { ContentItem } from "../fulfillment-types";

const deal = (over: Partial<Deal>): Deal =>
  ({
    id: 1,
    creator: "GamerGitta",
    platform: "youtube",
    platforms: null,
    agreed_price: null,
    current_offer: null,
    avg_views: null,
    actual_views: null,
    actual_orders: null,
    actual_revenue: null,
    ...over,
  }) as Deal;

const item = (over: Partial<ContentItem>): ContentItem =>
  ({
    id: 1,
    deal_id: 1,
    title: "Video",
    platform: "youtube",
    actual_views: null,
    actual_clicks: null,
    actual_orders: null,
    actual_revenue: null,
    ...over,
  }) as ContentItem;

describe("benchmarkRows", () => {
  it("splits a bundle by expected reach, so each platform gets its own CPM", () => {
    // Expect 50k per YouTube video and 50k per TikTok — one YT item, two TikToks,
    // so the fee splits 1/3 : 2/3.
    const expected = new Map([
      [reachKey(7, "youtube"), 50_000],
      [reachKey(7, "tiktok"), 50_000],
    ]);

    const rows = benchmarkRows(
      [deal({ partner_id: 7, agreed_price: 3000, platforms: '["youtube","tiktok"]' })],
      [
        item({ id: 1, platform: "youtube", actual_views: 50_000 }),
        item({ id: 2, platform: "tiktok", actual_views: 100_000 }),
        item({ id: 3, platform: "tiktok", actual_views: 100_000 }),
      ],
      expected
    );

    const yt = rows.find((r) => r.platform === "youtube")!;
    const tt = rows.find((r) => r.platform === "tiktok")!;

    expect(yt.price).toBeCloseTo(1000);
    expect(tt.price).toBeCloseTo(2000);
    expect(tt.label).toBe("2 items");

    // TikTok doubled its expected reach, YouTube merely met it — so TikTok's CPM
    // must come out lower. This is the whole point of splitting the deal.
    expect(yt.actualCpm).toBeCloseTo(20); // 1000 / 50k
    expect(tt.actualCpm).toBeCloseTo(10); // 2000 / 200k
    expect(tt.actualCpm).toBeLessThan(yt.actualCpm);
  });

  it("does not collapse every platform onto one CPM", () => {
    // Guards the trap in allocating by delivered views: price/views is then constant.
    const rows = benchmarkRows(
      [deal({ partner_id: 7, agreed_price: 2000, platforms: '["youtube","tiktok"]' })],
      [
        item({ id: 1, platform: "youtube", actual_views: 20_000 }),
        item({ id: 2, platform: "tiktok", actual_views: 180_000 }),
      ],
      new Map([
        [reachKey(7, "youtube"), 50_000],
        [reachKey(7, "tiktok"), 50_000],
      ])
    );
    const cpms = rows.map((r) => r.actualCpm);
    expect(new Set(cpms.map((c) => c.toFixed(2))).size).toBe(2);
  });

  it("falls back to delivered reach when the creator has no channel averages", () => {
    const rows = benchmarkRows(
      [deal({ agreed_price: 2800, platforms: '["youtube","tiktok"]' })],
      [
        item({ id: 1, platform: "youtube", actual_views: 60_000 }),
        item({ id: 2, platform: "tiktok", actual_views: 140_000 }),
      ]
    );
    const yt = rows.find((r) => r.platform === "youtube")!;
    expect(yt.price).toBeCloseTo(840); // 60k of 200k
    expect(rows.reduce((s, r) => s + r.price, 0)).toBeCloseTo(2800);
  });

  it("never credits a bundle's whole fee to one platform", () => {
    const rows = benchmarkRows(
      [deal({ agreed_price: 2800, platforms: '["youtube","tiktok"]' })],
      [
        item({ id: 1, platform: "youtube", actual_views: 60_000 }),
        item({ id: 2, platform: "tiktok", actual_views: 140_000 }),
      ]
    );
    // The bug this guards: one €14.00 CPM YouTube row for all 200k views.
    expect(rows.every((r) => r.price < 2800)).toBe(true);
    expect(rows.reduce((s, r) => s + r.price, 0)).toBeCloseTo(2800);
  });

  it("keeps predicted-vs-actual comparison only where it is meaningful", () => {
    const single = benchmarkRows(
      [deal({ agreed_price: 1000, avg_views: 50_000 })],
      [item({ actual_views: 40_000 })]
    );
    expect(single[0].predictedCpm).toBeCloseTo(20);
    expect(single[0].predictedViews).toBe(50_000);

    // A deal-level view prediction can't be attributed to one side of a bundle.
    const bundle = benchmarkRows(
      [deal({ agreed_price: 1000, avg_views: 50_000, platforms: '["youtube","tiktok"]' })],
      [
        item({ id: 1, platform: "youtube", actual_views: 20_000 }),
        item({ id: 2, platform: "tiktok", actual_views: 20_000 }),
      ]
    );
    expect(bundle.every((r) => r.predictedCpm === null)).toBe(true);
  });

  it("falls back to deal totals when no deliverable has results", () => {
    const rows = benchmarkRows(
      [deal({ agreed_price: 1500, avg_views: 70_000, actual_views: 61_000, actual_revenue: 2880 })],
      []
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].actualViews).toBe(61_000);
    expect(rows[0].actualCpm).toBeCloseTo(24.59, 1);
    expect(rows[0].roas).toBeCloseTo(1.92, 2);
  });

  it("ignores deals with no price or no measured reach", () => {
    expect(benchmarkRows([deal({ agreed_price: null, actual_views: 5000 })], [])).toEqual([]);
    expect(benchmarkRows([deal({ agreed_price: 1000 })], [])).toEqual([]);
    expect(
      benchmarkRows([deal({ agreed_price: 1000 })], [item({ actual_views: 0 })])
    ).toEqual([]);
  });

  it("attributes an item with no platform of its own to the deal's primary", () => {
    const rows = benchmarkRows(
      [deal({ agreed_price: 1000, platform: "instagram", platforms: '["instagram"]' })],
      [item({ platform: null, actual_views: 25_000 })]
    );
    expect(rows[0].platform).toBe("instagram");
  });
});

describe("platformAverages", () => {
  it("averages each platform separately and omits platforms with no data", () => {
    const rows = benchmarkRows(
      [
        deal({ id: 1, agreed_price: 2000, platforms: '["youtube","tiktok"]' }),
        deal({ id: 2, creator: "Hanna", agreed_price: 1000, platform: "instagram" }),
      ],
      [
        item({ id: 1, deal_id: 1, platform: "youtube", actual_views: 50_000 }),
        item({ id: 2, deal_id: 1, platform: "tiktok", actual_views: 50_000 }),
        item({ id: 3, deal_id: 2, platform: "instagram", actual_views: 40_000, actual_revenue: 2000 }),
      ]
    );

    const averages = platformAverages(rows);
    expect(averages.map((a) => a.platform).sort()).toEqual(["instagram", "tiktok", "youtube"]);

    const ig = averages.find((a) => a.platform === "instagram")!;
    expect(ig.avgActualCpm).toBeCloseTo(25); // 1000 / 40k * 1000
    expect(ig.avgRoas).toBeCloseTo(2);

    const yt = averages.find((a) => a.platform === "youtube")!;
    expect(yt.avgActualCpm).toBeCloseTo(20); // half of €2,000 over 50k views
  });
});
