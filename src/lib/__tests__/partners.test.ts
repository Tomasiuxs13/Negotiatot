import { describe, expect, it } from "vitest";
import {
  parseTags,
  partnerOperationalStats,
  partnerStats,
  partnerStatus,
  priorDeals,
} from "../partners";
import type { Deal } from "../types";
import type { ContentItem } from "../fulfillment-types";

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
    expect(stats.actualCpm).toBe(20); // ($20 CPM + $20 CPM) / 2
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

describe("partnerStatus", () => {
  const at = (stage: string, updated = "2026-07-01 10:00:00") =>
    deal({ stage: stage as Deal["stage"], updated_at: updated });

  it("reads the relationship from the deals, newest state winning", () => {
    expect(partnerStatus([])).toBe("prospect");
    expect(partnerStatus([at("lead")])).toBe("prospect");
    expect(partnerStatus([at("negotiating")])).toBe("negotiating");
    expect(partnerStatus([at("analyzing")])).toBe("negotiating");
    // Live delivery outranks an old negotiation.
    expect(partnerStatus([at("negotiating"), at("agreed")])).toBe("delivering");
  });

  it("distinguishes a recent partner from a lapsed one", () => {
    expect(partnerStatus([at("completed", "2026-06-01 10:00:00")], "2026-07-22")).toBe("past");
    expect(partnerStatus([at("completed", "2025-11-01 10:00:00")], "2026-07-22")).toBe("lapsed");
  });

  it("does not call someone a partner on a declined deal alone", () => {
    expect(partnerStatus([at("declined")])).toBe("prospect");
  });
});

describe("priorDeals", () => {
  it("returns only closed deals with a price, newest first, excluding the current one", () => {
    const history = priorDeals(
      [
        deal({ id: 1, stage: "completed", agreed_price: 2100, first_ask: 2400, actual_views: 71_000, updated_at: "2026-04-01 10:00:00" }),
        deal({ id: 2, stage: "agreed", agreed_price: 2450, updated_at: "2026-07-01 10:00:00" }),
        deal({ id: 3, stage: "negotiating", agreed_price: null, updated_at: "2026-07-10 10:00:00" }),
        deal({ id: 4, stage: "completed", agreed_price: 900, updated_at: "2026-01-01 10:00:00" }),
      ],
      4 // the deal being negotiated now
    );

    expect(history.map((h) => h.agreedPrice)).toEqual([2450, 2100]);
    expect(history[1].actualCpm).toBeCloseTo(29.58, 1); // 2100 / 71k * 1000
    expect(history[0].actualCpm).toBeNull(); // no actuals logged
  });

  it("is empty for a creator you have never closed with", () => {
    expect(priorDeals([deal({ stage: "negotiating", agreed_price: null })])).toEqual([]);
  });
});

describe("partnerOperationalStats", () => {
  const content = (over: Partial<ContentItem>): ContentItem =>
    ({
      id: 1,
      deal_id: 1,
      status: "planned",
      due_date: null,
      posted_at: null,
      revision_round: 0,
      ...over,
    }) as ContentItem;

  it("summarises delivery, punctuality and revision history", () => {
    const stats = partnerOperationalStats(
      [deal({ id: 1 }), deal({ id: 2 })],
      [
        content({ id: 1, deal_id: 1, status: "verified", due_date: "2026-07-10", posted_at: "2026-07-09", revision_round: 1 }),
        content({ id: 2, deal_id: 1, status: "posted", due_date: "2026-07-10", posted_at: "2026-07-12", revision_round: 3 }),
        content({ id: 3, deal_id: 2, status: "planned" }),
        content({ id: 4, deal_id: 99, status: "verified" }),
      ]
    );

    expect(stats).toEqual({
      promisedContent: 3,
      deliveredContent: 2,
      verifiedContent: 1,
      onTimeRate: 0.5,
      averageRevisionRounds: 2,
    });
  });

  it("keeps unknown reliability visibly unknown", () => {
    expect(partnerOperationalStats([deal({ id: 1 })], [])).toEqual({
      promisedContent: 0,
      deliveredContent: 0,
      verifiedContent: 0,
      onTimeRate: null,
      averageRevisionRounds: null,
    });
  });
});
