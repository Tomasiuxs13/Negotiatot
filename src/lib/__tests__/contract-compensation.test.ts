import { describe, expect, it } from "vitest";
import { compensationClauses, generateContractText } from "../contract-template";
import type { Deal } from "../types";
import type { PaymentItem } from "../fulfillment-types";

const NO_PAYMENTS: PaymentItem[] = [];

function deal(over: Partial<Deal> = {}): Deal {
  return {
    id: 1,
    creator: "jim.weglewski.explores",
    agreed_price: null,
    deliverables: "2 IG reels",
    format: null,
    rights: null,
    ...over,
  } as Deal;
}

describe("compensationClauses", () => {
  it("states a fixed fee on a normal paid deal", () => {
    const c = compensationClauses({
      agreedPrice: 900,
      payments: NO_PAYMENTS,
      commission: null,
      shipments: [],
    });
    expect(c.hasCashFee).toBe(true);
    expect(c.lines).toEqual(["  2.1 Fixed fee: $900"]);
  });

  it("names the commission rate, window, basis and payout date", () => {
    const c = compensationClauses({
      agreedPrice: 900,
      payments: NO_PAYMENTS,
      commission: { type: "percent", value: 10 },
      shipments: [],
    });
    expect(c.lines[1]).toContain("Commission: 10% of net sales");
    expect(c.lines[1]).toContain("Attribution window: 30 days from click");
    expect(c.lines[1]).toContain("exclude tax, shipping, refunds and cancellations");
    expect(c.lines[1]).toContain("Paid monthly in arrears");
  });

  it("prices a per-order commission in dollars, not percent", () => {
    const c = compensationClauses({
      agreedPrice: null,
      payments: NO_PAYMENTS,
      commission: { type: "per_order", value: 20 },
      shipments: [],
    });
    expect(c.lines.join("\n")).toContain("$20 per order");
  });

  /**
   * The whole point of the change: this deal shape used to print "[payment schedule]"
   * and name no money at all.
   */
  it("says there is no fee on a commission-only deal, then what is earned", () => {
    const c = compensationClauses({
      agreedPrice: null,
      payments: NO_PAYMENTS,
      commission: { type: "per_order", value: 20 },
      shipments: [{ product: "Suunto Core 2", value: 70 }],
    });
    expect(c.hasCashFee).toBe(false);
    expect(c.lines[0]).toContain("No fixed fee");
    expect(c.lines[1]).toContain("Commission: $20 per order");
    expect(c.lines[2]).toContain("Gifted product: Suunto Core 2 (retail value $70)");
  });

  it("does not claim a fee when the agreed price is zero", () => {
    const c = compensationClauses({
      agreedPrice: 0,
      payments: NO_PAYMENTS,
      commission: { type: "percent", value: 15 },
      shipments: [],
    });
    expect(c.hasCashFee).toBe(false);
    expect(c.lines.join("\n")).not.toContain("Fixed fee");
  });

  it("ignores a zero-valued commission rather than promising 0%", () => {
    const c = compensationClauses({
      agreedPrice: 500,
      payments: NO_PAYMENTS,
      commission: { type: "percent", value: 0 },
      shipments: [],
    });
    expect(c.lines.join("\n")).not.toContain("Commission");
  });

  it("still falls back to a placeholder when nothing is agreed at all", () => {
    const c = compensationClauses({
      agreedPrice: null,
      payments: NO_PAYMENTS,
      commission: null,
      shipments: [],
    });
    expect(c.lines).toEqual(["  2.1 [compensation to be agreed]"]);
  });

  it("keeps the payment schedule when one exists", () => {
    const c = compensationClauses({
      agreedPrice: 900,
      payments: [
        {
          amount: 450,
          description: "on signature",
          required_verified: null,
        } as PaymentItem,
        {
          amount: 450,
          description: "on delivery",
          required_verified: 2,
        } as PaymentItem,
      ],
      commission: null,
      shipments: [],
    });
    expect(c.lines[0]).toBe("  2.1 $450 — on signature");
    expect(c.lines[1]).toContain("payable after 2 deliverables are live and verified");
  });
});

describe("generateContractText", () => {
  it("drops the Net-30 invoice line when there is no cash fee", () => {
    const body = generateContractText({
      deal: deal(),
      partner: null,
      items: [],
      payments: NO_PAYMENTS,
      brand: { brandName: "Ryoko" },
      commission: { type: "per_order", value: 20 },
      shipments: [{ product: "Suunto Core 2", value: 70 }],
    });
    expect(body).not.toContain("Net-30");
    expect(body).toContain("No fixed fee");
  });

  it("keeps Net-30 on a paid deal", () => {
    const body = generateContractText({
      deal: deal({ agreed_price: 900 }),
      partner: null,
      items: [],
      payments: NO_PAYMENTS,
      brand: { brandName: "Ryoko" },
    });
    expect(body).toContain("Payment terms: Net-30 from invoice.");
  });
});
