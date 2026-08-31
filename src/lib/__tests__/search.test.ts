import { describe, expect, it } from "vitest";
import { normalizeQuery, rankBy, scoreMatch, SEARCH_MIN_CHARS } from "../search";

describe("normalizeQuery", () => {
  it("strips the @ people paste from a handle", () => {
    expect(normalizeQuery("  @TheOldCouple  ")).toBe("theoldcouple");
  });

  it("collapses the spacing of a pasted name", () => {
    expect(normalizeQuery("Joe   Holland")).toBe("joe holland");
  });
});

describe("scoreMatch", () => {
  it("ranks a whole-field match above a prefix above a substring", () => {
    expect(scoreMatch("fishing", ["Fishing"])).toBe(3);
    expect(scoreMatch("joe", ["Joe Holland Fishing"])).toBe(2);
    expect(scoreMatch("holland", ["Joe Holland Fishing"])).toBe(1);
    expect(scoreMatch("kayak", ["Joe Holland Fishing"])).toBe(0);
  });

  it("finds a handle through its punctuation — you remember the word, not the dots", () => {
    expect(scoreMatch("oldcouple", ["@the.old.couple.outdoors"])).toBe(1);
  });

  it("takes the best field, not the first", () => {
    expect(scoreMatch("marta", ["Some deliverables", "Marta"])).toBe(3);
  });

  it("scores nothing for an empty query, so a blank box lists nothing", () => {
    expect(scoreMatch("   ", ["Marta"])).toBe(0);
  });
});

describe("rankBy", () => {
  const rows = [
    { name: "Outdoor Joe" },
    { name: "Joe Holland" },
    { name: "Joe" },
    { name: "Kayak Carl" },
  ];

  it("orders by match quality and drops what does not match", () => {
    expect(rankBy("joe", rows, (r) => [r.name]).map((r) => r.name)).toEqual([
      "Joe",
      "Joe Holland",
      "Outdoor Joe",
    ]);
  });

  it("keeps the caller's order between equal matches — recency stays meaningful", () => {
    const ties = [{ name: "Joe B" }, { name: "Joe A" }];
    expect(rankBy("joe", ties, (r) => [r.name]).map((r) => r.name)).toEqual(["Joe B", "Joe A"]);
  });
});

describe("SEARCH_MIN_CHARS", () => {
  it("is short enough for initials but long enough not to match the pipeline", () => {
    expect(SEARCH_MIN_CHARS).toBe(2);
  });
});
