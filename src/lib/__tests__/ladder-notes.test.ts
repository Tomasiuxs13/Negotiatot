import { describe, expect, it } from "vitest";
import { ladderNotes } from "../ladder-notes";
import type { Commission, Discount } from "../commission";

const cpa: Commission = { type: "per_order", value: 20 };
const code: Discount = { type: "fixed", value: 20 };

describe("ladderNotes", () => {
  it("says what a bundle fee covers and what one piece is worth", () => {
    // The Gary Bembridge case: $2,717 read as a per-video rate when it's for three.
    const n = ladderNotes({
      targetFee: 2717,
      pieces: 3,
      scopeText: "3x youtube integrations",
      expectedOrders: 71,
      aov: 120,
      commission: cpa,
      discount: code,
      productCost: 80,
    });
    expect(n.scopeNote).toBe("Fee covers 3x youtube integrations · about $906 each");
  });

  it("counts commission, coupon and product into the real cost", () => {
    // $2,717 fee + 71 × ($20 + $20) + $80 product.
    const n = ladderNotes({
      targetFee: 2717,
      pieces: 3,
      expectedOrders: 71,
      aov: 120,
      commission: cpa,
      discount: code,
      productCost: 80,
    });
    expect(n.costNote).toBe("Total cost about $5,637 with commission, code and product");
  });

  it("stays quiet about cost when the fee is the whole cost", () => {
    const n = ladderNotes({ targetFee: 2000, pieces: 1, expectedOrders: 40, aov: 120 });
    expect(n.costNote).toBeNull();
  });

  it("adds no per-piece figure on a single-piece deal", () => {
    const n = ladderNotes({
      targetFee: 900,
      pieces: 1,
      scopeText: "1 youtube integration",
      expectedOrders: 10,
      aov: 120,
    });
    expect(n.scopeNote).toBe("Fee covers 1 youtube integration");
  });

  it("falls back to a piece count when the manager wrote no scope", () => {
    const n = ladderNotes({ targetFee: 600, pieces: 3, expectedOrders: 5, aov: 120 });
    expect(n.scopeNote).toBe("Fee covers 3 pieces · about $200 each");
  });

  it("says nothing at all before a target exists", () => {
    const n = ladderNotes({ targetFee: null, pieces: 1, expectedOrders: 0, aov: 120 });
    expect(n).toEqual({ scopeNote: null, costNote: null });
  });
});
