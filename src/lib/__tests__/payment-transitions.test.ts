import { describe, expect, it } from "vitest";
import { canTransition, isPaymentStatus } from "../payment-transitions";

describe("canTransition", () => {
  it("allows the normal path: approve, then pay", () => {
    expect(canTransition("approvable", "approved").ok).toBe(true);
    expect(canTransition("approved", "paid").ok).toBe(true);
  });

  it("allows undoing an approval", () => {
    expect(canTransition("approved", "approvable").ok).toBe(true);
  });

  it("refuses to pay money that was never approved", () => {
    // The stale-tab case: a pending payment marked paid with nothing verified — and the
    // recompute engine never downgrades settled money, so the mistake was permanent.
    const r = canTransition("pending", "paid");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("isn't ready");
    expect(canTransition("approvable", "paid").ok).toBe(false);
  });

  it("treats paid as terminal", () => {
    expect(canTransition("paid", "approved").ok).toBe(false);
    expect(canTransition("paid", "pending").ok).toBe(false);
    expect(canTransition("paid", "approvable").ok).toBe(false);
  });

  it("keeps pending machine-managed — no manual move lands on or leaves it", () => {
    expect(canTransition("pending", "approved").ok).toBe(false);
    expect(canTransition("approved", "pending").ok).toBe(false);
    expect(canTransition("approvable", "pending").ok).toBe(false);
  });

  it("is a no-op to set the same status again", () => {
    expect(canTransition("approved", "approved").ok).toBe(true);
  });
});

describe("isPaymentStatus", () => {
  it("accepts the four real statuses and nothing else", () => {
    expect(isPaymentStatus("paid")).toBe(true);
    expect(isPaymentStatus("approvable")).toBe(true);
    // What a stale or malicious client can actually send:
    expect(isPaymentStatus("PAID")).toBe(false);
    expect(isPaymentStatus("cancelled")).toBe(false);
    expect(isPaymentStatus(3)).toBe(false);
    expect(isPaymentStatus(null)).toBe(false);
  });
});
