import { describe, expect, it } from "vitest";
import { parseTags, partnerStats } from "../partners";
import type { Deal } from "../types";

const deal = (over: Partial<Deal>): Deal =>
  ({
    id: 1,
    creator: "X",
    stage: "analyzing",
    agreed_price: null,
    first_ask: null,
    avg_views: null,
    updated_at: "2026-07-01 10:00:00",
    ...over,
  }) as Deal;

describe("partnerStats", () => {
  it("summarises a partner's lifetime across deals", () => {
    const stats = partnerStats([
      deal({ id: 1, stage: "completed", agreed_price: 2000, first_ask: 3000, actual_views: 100_000, updated_at: "2026-05-01 10:00:00" }),
      deal({ id: 2, stage: "agreed", agreed_price: 1000, first_ask: 1200, actual_views: 50_000, updated_at: "2026-06-01 10:00:00" }),
      deal({ id: 3, stage: "negotiating", updated_at: "2026-07-01 10:00:00" }),
      deal({ id: 4, stage: "declined", updated_at: "2026-04-01 10:00:00" }),
    ]);

    expect(stats.totalDeals).toBe(4);
    expect(stats.wonDeals).toBe(2); // agreed and completed both count as won
    expect(stats.activeDeals).toBe(1); // declined and completed are not active
    expect(stats.committed).toBe(3000);
    expect(stats.paid).toBe(2000); // only the completed deal's money actually went out
    expect(stats.savedVsAsk).toBe(1200); // 1000 + 200
    expect(stats.actualCpm).toBe(20); // (€20 CPM + €20 CPM) / 2
    expect(stats.lastDealAt).toBe("2026-07-01 10:00:00");
  });

  it("reports no CPM until actuals are logged, ignoring predicted views", () => {
    const stats = partnerStats([
      deal({ stage: "agreed", agreed_price: 2000, avg_views: 100_000, actual_views: null }),
    ]);
    expect(stats.actualCpm).toBeNull();
    expect(stats.committed).toBe(2000);
  });

  it("never reports negative savings when a deal closed above the first ask", () => {
    const stats = partnerStats([
      deal({ stage: "agreed", agreed_price: 2000, first_ask: 1500 }),
    ]);
    expect(stats.savedVsAsk).toBe(0);
  });

  it("skips deals without the data needed for CPM", () => {
    const stats = partnerStats([
      deal({ stage: "agreed", agreed_price: 1000, actual_views: null }),
      deal({ stage: "agreed", agreed_price: null, actual_views: 50_000 }),
    ]);
    expect(stats.actualCpm).toBeNull();
    expect(stats.committed).toBe(1000);
  });

  it("handles a partner with no deals", () => {
    const stats = partnerStats([]);
    expect(stats).toMatchObject({ totalDeals: 0, committed: 0, paid: 0, actualCpm: null, lastDealAt: null });
  });
});

describe("parseTags", () => {
  it("parses a JSON array and tolerates junk", () => {
    expect(parseTags('["tech","DACH"]')).toEqual(["tech", "DACH"]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags("not json")).toEqual([]);
    expect(parseTags('{"a":1}')).toEqual([]);
  });
});
