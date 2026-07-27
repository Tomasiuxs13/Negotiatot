import { describe, expect, it } from "vitest";
import {
  breakevenFee,
  commissionPerOrder,
  dealCommission,
  describeCommission,
  expectedCommission,
  feeReduction,
  trueDealCost,
  NO_COMMISSION,
  type Commission,
} from "../commission";

const economics = { aov: 120, grossMarginPct: 60, repeatFactor: 1 };
const tenPct: Commission = { type: "percent", value: 10 };

describe("commissionPerOrder", () => {
  it("takes a percent of the order value", () => {
    expect(commissionPerOrder(tenPct, 120)).toBe(12);
  });

  it("takes a flat amount per order regardless of basket size", () => {
    expect(commissionPerOrder({ type: "per_order", value: 15 }, 120)).toBe(15);
    expect(commissionPerOrder({ type: "per_order", value: 15 }, 300)).toBe(15);
  });

  it("costs nothing when there's no commission", () => {
    expect(commissionPerOrder(NO_COMMISSION, 120)).toBe(0);
    expect(commissionPerOrder({ type: "percent", value: 0 }, 120)).toBe(0);
  });
});

describe("expectedCommission", () => {
  it("scales with the orders you expect", () => {
    expect(expectedCommission(tenPct, 120, 50)).toBe(600); // 50 × €12
  });

  it("is nothing when nothing is expected to sell", () => {
    expect(expectedCommission(tenPct, 120, 0)).toBe(0);
  });
});

describe("breakevenFee", () => {
  it("is the whole margin when no commission is paid", () => {
    // 50 orders × €120 × 60% = €3,600
    expect(breakevenFee({ expectedOrders: 50, economics })).toBe(3600);
  });

  it("drops euro-for-euro by the commission you'll owe", () => {
    // Same deal at 10%: €3,600 margin − €600 commission = €3,000 of affordable fee.
    expect(breakevenFee({ expectedOrders: 50, economics, commission: tenPct })).toBe(3000);
  });

  it("counts repeat value toward what you can afford", () => {
    const withRepeat = { ...economics, repeatFactor: 1.35 };
    expect(breakevenFee({ expectedOrders: 50, economics: withRepeat })).toBe(4860);
  });

  it("refuses to go negative when commission alone exceeds the margin", () => {
    // 70% commission against a 60% margin: the fee can only be zero, never negative.
    const fee = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 70 },
    });
    expect(fee).toBe(0);
  });

  it("has no room for a fee when nothing is expected to sell", () => {
    expect(breakevenFee({ expectedOrders: 0, economics, commission: tenPct })).toBe(0);
  });
});

describe("feeReduction", () => {
  it("quantifies how much the fixed fee has to come down", () => {
    // The number to put in front of a creator: your 10% is worth €600 on this deal.
    expect(feeReduction({ expectedOrders: 50, economics, commission: tenPct })).toBe(600);
  });

  it("is nothing when there's no commission to trade against", () => {
    expect(feeReduction({ expectedOrders: 50, economics, commission: NO_COMMISSION })).toBe(0);
  });

  it("never reports a negative reduction once the fee is floored at zero", () => {
    const reduction = feeReduction({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 90 },
    });
    expect(reduction).toBe(3600); // the entire margin, not more
  });
});

describe("trueDealCost", () => {
  it("adds the expected commission to the agreed fee", () => {
    const cost = trueDealCost({ fee: 2000, expectedOrders: 50, aov: 120, commission: tenPct });
    expect(cost).toEqual({ fee: 2000, commission: 600, total: 2600 });
  });

  it("is just the fee on a flat deal", () => {
    const cost = trueDealCost({ fee: 2000, expectedOrders: 50, aov: 120 });
    expect(cost.total).toBe(2000);
  });
});

describe("describeCommission", () => {
  it("reads naturally in a prompt or on a card", () => {
    expect(describeCommission(tenPct)).toBe("10% commission per sale");
    expect(describeCommission({ type: "per_order", value: 15 })).toBe("€15 per order");
    expect(describeCommission(NO_COMMISSION)).toBe("no commission");
  });
});

describe("dealCommission", () => {
  it("reads a commission off a deal row", () => {
    expect(dealCommission({ commission_type: "percent", commission_value: 12 })).toEqual({
      type: "percent",
      value: 12,
    });
  });

  it("treats a deal from before commissions existed as flat-fee", () => {
    expect(dealCommission({})).toEqual(NO_COMMISSION);
    expect(dealCommission({ commission_type: null, commission_value: null })).toEqual(NO_COMMISSION);
    expect(dealCommission({ commission_type: "nonsense", commission_value: 5 })).toEqual(
      NO_COMMISSION
    );
  });
});
