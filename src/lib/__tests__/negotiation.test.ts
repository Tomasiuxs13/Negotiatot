import { describe, expect, it } from "vitest";
import { buildRounds, currentGap } from "../negotiation";

const marta = { first_ask: 3500, avg_views: 96400 };

const thread = [
  { sender: "them" as const, meta: null },
  { sender: "us" as const, meta: JSON.stringify({ offer: 1950 }) },
  { sender: "them" as const, meta: JSON.stringify({ counter: 3100 }) },
];

describe("buildRounds", () => {
  it("reconstructs the full offer history in order", () => {
    const rounds = buildRounds(marta, thread, { round: 2, proposedOffer: 2300 });
    expect(rounds.map((r) => [r.round, r.amount, r.label])).toEqual([
      ["R1", 3500, "their ask"],
      ["R1", 1950, "our offer"],
      ["R2", 3100, "their counter"],
      ["R2", 2300, "proposed"],
    ]);
  });

  it("computes CPM detail from avg views", () => {
    const rounds = buildRounds(marta, thread, null);
    expect(rounds[0].detail).toBe("€36.31 CPM");
    expect(rounds[1].detail).toBe("€20.23 CPM");
  });

  it("reports how far they moved on counters", () => {
    const rounds = buildRounds(marta, thread, null);
    const counter = rounds.find((r) => r.label === "their counter");
    expect(counter?.detail).toBe("moved €400");
  });

  it("handles a deal with no ask and no messages (outbound opening)", () => {
    const rounds = buildRounds({ first_ask: null, avg_views: null }, [], {
      round: 1,
      proposedOffer: 2398,
    });
    expect(rounds).toEqual([{ round: "R1", amount: 2398, label: "proposed", detail: "pending" }]);
  });

  it("skips copilot messages and messages without meta", () => {
    const rounds = buildRounds(marta, [
      { sender: "copilot", meta: JSON.stringify({ proposedOffer: 999 }) },
      { sender: "them", meta: null },
    ], null);
    expect(rounds).toHaveLength(1); // only the first ask
  });
});

describe("currentGap", () => {
  it("is their latest position minus our latest offer/proposal", () => {
    const rounds = buildRounds(marta, thread, { round: 2, proposedOffer: 2300 });
    expect(currentGap(rounds)).toBe(800);
  });

  it("uses the last sent offer when there is no pending proposal", () => {
    const rounds = buildRounds(marta, thread, null);
    expect(currentGap(rounds)).toBe(3100 - 1950);
  });

  it("is null when either side has not named a number", () => {
    expect(currentGap(buildRounds({ first_ask: null, avg_views: null }, [], null))).toBeNull();
    expect(currentGap(buildRounds(marta, [], null))).toBeNull();
  });
});
