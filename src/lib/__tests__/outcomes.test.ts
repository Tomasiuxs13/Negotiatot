import { describe, expect, it } from "vitest";
import { outcomes } from "../outcomes";
import type { Deal } from "../types";

const deal = (over: Partial<Deal>): Deal =>
  ({
    id: 1,
    stage: "negotiating",
    agreed_price: null,
    current_ask: null,
    first_ask: null,
    decline_reason: null,
    ...over,
  }) as Deal;

describe("outcomes", () => {
  it("counts a win rate only across settled deals", () => {
    const r = outcomes([
      deal({ id: 1, stage: "completed", agreed_price: 2100 }),
      deal({ id: 2, stage: "agreed", agreed_price: 2450 }),
      deal({ id: 3, stage: "declined", decline_reason: "too_expensive", current_ask: 3100 }),
      deal({ id: 4, stage: "negotiating" }), // still open — must not count either way
    ]);

    expect(r.won).toBe(2);
    expect(r.lost).toBe(1);
    expect(r.open).toBe(1);
    expect(r.winRate).toBeCloseTo(2 / 3);
    expect(r.wonValue).toBe(4550);
    expect(r.lostValue).toBe(3100);
  });

  it("has no win rate before anything settles", () => {
    expect(outcomes([deal({ stage: "negotiating" }), deal({ id: 2, stage: "lead" })]).winRate).toBeNull();
  });

  it("groups losses by reason, biggest first", () => {
    const r = outcomes([
      deal({ id: 1, stage: "declined", decline_reason: "too_expensive", current_ask: 3000 }),
      deal({ id: 2, stage: "declined", decline_reason: "too_expensive", current_ask: 2000 }),
      deal({ id: 3, stage: "declined", decline_reason: "no_reply", first_ask: 900 }),
    ]);

    expect(r.reasons[0]).toMatchObject({ reason: "too_expensive", count: 2, value: 5000 });
    expect(r.reasons[0].label).toBe("Above our walk-away");
    expect(r.reasons[1]).toMatchObject({ reason: "no_reply", count: 1, value: 900 });
  });

  it("files a decline with no recorded reason under other", () => {
    const r = outcomes([deal({ stage: "declined", decline_reason: null })]);
    expect(r.reasons[0].reason).toBe("other");
  });

  it("reports nothing for an empty pipeline", () => {
    const r = outcomes([]);
    expect(r).toMatchObject({ won: 0, lost: 0, open: 0, winRate: null });
    expect(r.reasons).toEqual([]);
  });
});
