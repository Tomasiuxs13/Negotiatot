import { describe, expect, it } from "vitest";
import {
  breakevenFee,
  suggestStructure,
  commissionPerOrder,
  dealCommission,
  describeCommission,
  expectedCommission,
  feeReduction,
  trueDealCost,
  NO_COMMISSION,
  NO_DISCOUNT,
  discountPerOrder,
  offerCostPerOrder,
  describeDiscount,
  dealDiscount,
  type Commission,
  type Discount,
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
    expect(cost).toEqual({ fee: 2000, commission: 600, discount: 0, product: 0, total: 2600 });
  });

  it("counts the gifted product — free to them isn't free to you", () => {
    const cost = trueDealCost({
      fee: 2000,
      expectedOrders: 50,
      aov: 120,
      commission: tenPct,
      productCost: 140,
    });
    expect(cost).toEqual({ fee: 2000, commission: 600, discount: 0, product: 140, total: 2740 });
  });

  it("is just the fee on a flat deal", () => {
    const cost = trueDealCost({ fee: 2000, expectedOrders: 50, aov: 120 });
    expect(cost.total).toBe(2000);
  });
});

describe("breakevenFee with gifted product", () => {
  it("takes the product cost out of what the fee can be", () => {
    // €3,600 margin − €600 commission − €140 product = €2,860.
    const fee = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: tenPct,
      productCost: 140,
    });
    expect(fee).toBe(2860);
  });

  it("leaves no fee when the product alone eats the margin", () => {
    // A tiny channel: 2 orders of margin against a €200 product.
    const fee = breakevenFee({ expectedOrders: 2, economics, productCost: 200 });
    expect(fee).toBe(0);
  });
});

describe("suggestStructure", () => {
  const floor = { minPaidFee: 100, hasProduct: true, hasCommission: true };

  it("keeps a fixed fee when the numbers support one", () => {
    expect(suggestStructure({ ...floor, affordableFee: 2000 }).structure).toBe("paid");
  });

  it("switches a token fee to product plus commission", () => {
    // The Sigcruiser case: ~900 avg views puts the affordable fee at €22.
    const s = suggestStructure({ ...floor, affordableFee: 22 });
    expect(s.structure).toBe("gifted_plus_commission");
    expect(s.reason).toContain("€22");
  });

  it("treats the floor as inclusive", () => {
    expect(suggestStructure({ ...floor, affordableFee: 100 }).structure).toBe("paid");
  });

  it("calls it unviable when there's no product or commission to fall back on", () => {
    const s = suggestStructure({
      affordableFee: 22,
      minPaidFee: 100,
      hasProduct: false,
      hasCommission: false,
    });
    expect(s.structure).toBe("not_viable");
  });

  it("still offers the gifted route when only a product is on the table", () => {
    const s = suggestStructure({
      affordableFee: 0,
      minPaidFee: 100,
      hasProduct: true,
      hasCommission: false,
    });
    expect(s.structure).toBe("gifted_plus_commission");
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

describe("audience discount", () => {
  const twentyOff: Discount = { type: "fixed", value: 20 };

  it("costs you the face value of the coupon", () => {
    // Cost of goods doesn't change, so €20 off is €20 straight off margin.
    expect(discountPerOrder(twentyOff, 120)).toBe(20);
    expect(discountPerOrder({ type: "percent", value: 15 }, 120)).toBe(18);
    expect(discountPerOrder(NO_DISCOUNT, 120)).toBe(0);
  });

  it("never gives away more than the order is worth", () => {
    expect(discountPerOrder({ type: "fixed", value: 500 }, 120)).toBe(120);
  });

  it("pays percentage commission on what the customer actually paid", () => {
    // €120 − €20 coupon = €100 paid; 20% of that is €20, not €24.
    expect(commissionPerOrder({ type: "percent", value: 20 }, 120, twentyOff)).toBe(20);
  });

  it("pays a flat CPA regardless of the coupon", () => {
    expect(commissionPerOrder({ type: "per_order", value: 15 }, 120, twentyOff)).toBe(15);
  });

  it("stacks both levers into one per-order cost", () => {
    const cost = offerCostPerOrder({
      aov: 120,
      commission: { type: "percent", value: 20 },
      discount: twentyOff,
    });
    expect(cost).toEqual({ discount: 20, commission: 20, total: 40 });
  });
});

describe("breakevenFee with a discount code", () => {
  it("treats the coupon as a cost, not a freebie", () => {
    // 50 orders: €3,600 margin − €1,000 coupon − €1,000 commission = €1,600 of fee.
    const fee = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 20 },
      discount: { type: "fixed", value: 20 },
    });
    expect(fee).toBe(1600);
  });

  it("shows how much a discount code costs against commission alone", () => {
    const withoutCode = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 20 },
    });
    // 20% of the full €120 = €24/order, so €3,600 − €1,200 = €2,400.
    expect(withoutCode).toBe(2400);
  });
});

describe("trueDealCost with every lever", () => {
  it("itemises fee, commission, coupon and product", () => {
    const cost = trueDealCost({
      fee: 500,
      expectedOrders: 50,
      aov: 120,
      commission: { type: "percent", value: 20 },
      discount: { type: "fixed", value: 20 },
      productCost: 80,
    });
    expect(cost).toEqual({
      fee: 500,
      commission: 1000,
      discount: 1000,
      product: 80,
      total: 2580,
    });
  });
});

describe("describeDiscount / dealDiscount", () => {
  it("reads naturally", () => {
    expect(describeDiscount({ type: "fixed", value: 20 })).toBe("€20 off for their audience");
    expect(describeDiscount({ type: "percent", value: 15 })).toBe("15% off for their audience");
    expect(describeDiscount(NO_DISCOUNT)).toBe("no discount code");
  });

  it("tolerates deals from before discounts existed", () => {
    expect(dealDiscount({})).toEqual(NO_DISCOUNT);
    expect(dealDiscount({ discount_type: "fixed", discount_value: 20 })).toEqual({
      type: "fixed",
      value: 20,
    });
  });
});
