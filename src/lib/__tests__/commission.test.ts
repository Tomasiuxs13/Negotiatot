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
  rateForVolume,
  tieredCommission,
  nextTier,
  parseTiers,
  describeTiers,
  resolveOffer,
  expectedOrdersFrom,
  earningsForecast,
  marginAtZeroFee,
  type Commission,
  type CommissionTier,
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
    expect(expectedCommission(tenPct, 120, 50)).toBe(600); // 50 × $12
  });

  it("is nothing when nothing is expected to sell", () => {
    expect(expectedCommission(tenPct, 120, 0)).toBe(0);
  });
});

describe("breakevenFee", () => {
  it("is the whole margin when no commission is paid", () => {
    // 50 orders × $120 × 60% = $3,600
    expect(breakevenFee({ expectedOrders: 50, economics })).toBe(3600);
  });

  it("drops dollar-for-dollar by the commission you'll owe", () => {
    // Same deal at 10%: $3,600 margin − $600 commission = $3,000 of affordable fee.
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
    // The number to put in front of a creator: your 10% is worth $600 on this deal.
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
    // $3,600 margin − $600 commission − $140 product = $2,860.
    const fee = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: tenPct,
      productCost: 140,
    });
    expect(fee).toBe(2860);
  });

  it("leaves no fee when the product alone eats the margin", () => {
    // A tiny channel: 2 orders of margin against a $200 product.
    const fee = breakevenFee({ expectedOrders: 2, economics, productCost: 200 });
    expect(fee).toBe(0);
  });
});

describe("marginAtZeroFee", () => {
  it("shows the loss that breakevenFee hides behind its floor", () => {
    // The Sigcruiser case: an $80 product against well under one expected order.
    // 0.83 × $97.20 profit = $80.68, less 0.83 × $20 commission = $64.08, less the $80
    // product. The coupon is not charged to the deal.
    const params = {
      expectedOrders: 0.83,
      economics: { aov: 120, grossMarginPct: 60, repeatFactor: 1.35 },
      commission: { type: "per_order", value: 20 } as Commission,
      discount: { type: "fixed", value: 20 } as Discount,
      productCost: 80,
    };
    expect(breakevenFee(params)).toBe(0); // "no room for a fee"
    expect(marginAtZeroFee(params)).toBeCloseTo(-15.92, 2); // ...because it loses money
  });

  it("agrees with breakevenFee whenever the deal is profitable", () => {
    const params = {
      expectedOrders: 50,
      economics: { aov: 120, grossMarginPct: 60, repeatFactor: 1 },
      commission: tenPct,
      productCost: 140,
    };
    expect(marginAtZeroFee(params)).toBe(breakevenFee(params));
  });

  it("is the product cost when the creator sells nothing at all", () => {
    // Not zero: the product was still bought and shipped.
    expect(
      marginAtZeroFee({ expectedOrders: 0, economics, productCost: 200 })
    ).toBe(-200);
  });
});

describe("earningsForecast edge cases", () => {
  const ladder: CommissionTier[] = [
    { minOrders: 15, amount: 30 },
    { minOrders: 30, amount: 40 },
  ];

  it("pays the base commission below the ladder's first rung", () => {
    // A 10% commission with a ladder starting at 15 orders: 3 orders is below every
    // rung, but it is not $0/sale — the base rate applies.
    const f = earningsForecast({
      expectedOrders: 3,
      commission: { type: "percent", value: 10 },
      aov: 120,
      tiers: ladder,
    });
    expect(f.perOrder).toBe(12);
    expect(f.total).toBe(36);
  });

  it("pays the tier rate once the volume reaches a rung", () => {
    const f = earningsForecast({
      expectedOrders: 31,
      commission: { type: "percent", value: 10 },
      aov: 120,
      tiers: ladder,
    });
    expect(f.perOrder).toBe(40);
  });

  it("rounds the per-sale rate to cents — it's quoted verbatim in drafts", () => {
    // 12% of a $101.99 basket after a 15% code: raw float ends ...980000000000001.
    const f = earningsForecast({
      expectedOrders: 10,
      commission: { type: "percent", value: 12 },
      aov: 119.99,
      discount: { type: "percent", value: 15 },
    });
    expect(f.perOrder).toBe(12.24);
  });
});

describe("resolveOffer with zero-valued overrides", () => {
  it("falls back to the Playbook when the deal's commission is zero", () => {
    // commission_type set with value 0 is "no override", not "no commission" — treating
    // it as the latter produced $0/sale forecasts on deals paying the standard rate.
    const { commission } = resolveOffer(
      { commission_type: "percent", commission_value: 0 },
      { commissionPerOrder: 20 }
    );
    expect(commission).toEqual({ type: "per_order", value: 20 });
  });

  it("still lets a real deal override beat the Playbook", () => {
    const { commission } = resolveOffer(
      { commission_type: "percent", commission_value: 12 },
      { commissionPerOrder: 20 }
    );
    expect(commission).toEqual({ type: "percent", value: 12 });
  });
});

describe("suggestStructure", () => {
  const floor = { minPaidFee: 100, hasProduct: true, hasCommission: true };

  it("keeps a fixed fee when the numbers support one", () => {
    expect(suggestStructure({ ...floor, affordableFee: 2000 }).structure).toBe("paid");
  });

  it("switches a token fee to product plus commission", () => {
    // The Sigcruiser case: ~900 avg views puts the affordable fee at $22.
    const s = suggestStructure({ ...floor, affordableFee: 22 });
    expect(s.structure).toBe("gifted_plus_commission");
    expect(s.reason).toContain("$22");
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
    expect(describeCommission({ type: "per_order", value: 15 })).toBe("$15 per order");
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
    // Cost of goods doesn't change, so $20 off is $20 straight off margin.
    expect(discountPerOrder(twentyOff, 120)).toBe(20);
    expect(discountPerOrder({ type: "percent", value: 15 }, 120)).toBe(18);
    expect(discountPerOrder(NO_DISCOUNT, 120)).toBe(0);
  });

  it("never gives away more than the order is worth", () => {
    expect(discountPerOrder({ type: "fixed", value: 500 }, 120)).toBe(120);
  });

  it("pays percentage commission on what the customer actually paid", () => {
    // $120 − $20 coupon = $100 paid; 20% of that is $20, not $24.
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
  it("does not charge the coupon to the deal", () => {
    // The coupon is standing marketing spend, measured in blended AOV and ROAS, so only
    // commission comes off: 50 orders × $120 × 60% = $3,600 margin, less 20% commission
    // on the $100 the customer actually paid ($20 × 50 = $1,000) = $2,600 of fee.
    const fee = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 20 },
      discount: { type: "fixed", value: 20 },
    });
    expect(fee).toBe(2600);
  });

  it("shows how much a discount code costs against commission alone", () => {
    const withoutCode = breakevenFee({
      expectedOrders: 50,
      economics,
      commission: { type: "percent", value: 20 },
    });
    // 20% of the full $120 = $24/order, so $3,600 − $1,200 = $2,400.
    expect(withoutCode).toBe(2400);
  });
});

describe("trueDealCost with every lever", () => {
  it("reports the coupon but leaves it out of the total", () => {
    // The coupon is visible as a figure — it is real money — but the total a manager
    // negotiates against is fee + commission + product only.
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
      total: 1580,
    });
  });
});

describe("describeDiscount / dealDiscount", () => {
  it("reads naturally", () => {
    expect(describeDiscount({ type: "fixed", value: 20 })).toBe("$20 off for their audience");
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

describe("volume tiers", () => {
  // The user's programme: $20/sale, rising to $40 as volume grows.
  const tiers: CommissionTier[] = [
    { minOrders: 0, amount: 20 },
    { minOrders: 25, amount: 30 },
    { minOrders: 50, amount: 40 },
  ];

  it("pays the rate the volume reached, on every sale", () => {
    expect(rateForVolume(tiers, 0)).toBe(20);
    expect(rateForVolume(tiers, 24)).toBe(20);
    expect(rateForVolume(tiers, 25)).toBe(30); // rung is inclusive
    expect(rateForVolume(tiers, 60)).toBe(40);
  });

  it("applies the reached rate retroactively, not progressively", () => {
    // 50 sales at $40 = $2,000 — not 25×20 + 25×30 = $1,250.
    expect(tieredCommission(tiers, 50)).toBe(2000);
    expect(tieredCommission(tiers, 10)).toBe(200);
  });

  it("costs nothing with no sales or no ladder", () => {
    expect(tieredCommission(tiers, 0)).toBe(0);
    expect(tieredCommission([], 50)).toBe(0);
  });

  it("falls back to zero below the lowest rung", () => {
    expect(rateForVolume([{ minOrders: 10, amount: 25 }], 5)).toBe(0);
  });

  it("names the next rung and what reaching it is worth", () => {
    // At 20 sales they're earning $400. At 25 they'd earn $750 — worth $350 more.
    const next = nextTier(tiers, 20)!;
    expect(next.tier.amount).toBe(30);
    expect(next.ordersAway).toBe(5);
    expect(next.extraTotal).toBe(350);
  });

  it("has nothing to pitch at the top rung", () => {
    expect(nextTier(tiers, 100)).toBeNull();
  });

  it("parses and prints the Playbook's ladder, sorting as it goes", () => {
    const parsed = parseTiers(["50: 40", "0: 20", "25: 30", "nonsense"]);
    expect(parsed).toEqual(tiers);
    expect(describeTiers(parsed)).toBe("$20/sale from 0, $30/sale from 25, $40/sale from 50");
    expect(describeTiers([])).toBe("no volume tiers");
  });
});

describe("parseTiers robustness", () => {
  it("accepts a whole ladder typed on one line", () => {
    // Exactly how it was entered in the Playbook — and it silently parsed to nothing,
    // leaving the model to guess the structure from the raw text.
    expect(parseTiers(["0:20, 15:30, 30:40 "])).toEqual([
      { minOrders: 0, amount: 20 },
      { minOrders: 15, amount: 30 },
      { minOrders: 30, amount: 40 },
    ]);
  });

  it("tolerates currency symbols and loose spacing", () => {
    expect(parseTiers(["0: $20", " 25 : $30 "])).toEqual([
      { minOrders: 0, amount: 20 },
      { minOrders: 25, amount: 30 },
    ]);
  });

  it("still reads one rung per line", () => {
    expect(parseTiers(["0: 20", "25: 30"])).toHaveLength(2);
  });

  it("drops entries it cannot read rather than inventing them", () => {
    expect(parseTiers(["nonsense", "0: 20"])).toEqual([{ minOrders: 0, amount: 20 }]);
  });
});

describe("resolveOffer", () => {
  const econ = { commissionPerOrder: 20, commissionPercent: 0, discountFixed: 0, discountPercent: 0 };

  it("falls back to the Playbook's standard offer when the deal says nothing", () => {
    // The Sigcruiser case: $20/sale was set in the Playbook but never reached the model,
    // because the deal predated the field and carried no commission of its own.
    const { commission } = resolveOffer({}, econ);
    expect(commission).toEqual({ type: "per_order", value: 20 });
  });

  it("prefers a per-order CPA over a percentage when both are configured", () => {
    const { commission } = resolveOffer({}, { ...econ, commissionPercent: 15 });
    expect(commission.type).toBe("per_order");
  });

  it("lets the deal override the standard offer", () => {
    const { commission } = resolveOffer(
      { commission_type: "percent", commission_value: 12 },
      econ
    );
    expect(commission).toEqual({ type: "percent", value: 12 });
  });

  it("falls back for the audience discount too", () => {
    const { discount } = resolveOffer({}, { ...econ, discountFixed: 20 });
    expect(discount).toEqual({ type: "fixed", value: 20 });
  });

  it("stays empty when neither deal nor Playbook offers anything", () => {
    const { commission, discount } = resolveOffer({}, {});
    expect(commission).toEqual(NO_COMMISSION);
    expect(discount).toEqual(NO_DISCOUNT);
  });
});

describe("expectedOrdersFrom", () => {
  it("walks views through clicks to orders", () => {
    // 10,000 views × 1% = 100 clicks × 3% = 3 orders.
    expect(expectedOrdersFrom({ views: 10000, linkCtrPct: 1, orderConversionPct: 3 })).toBe(3);
  });

  it("scales with the number of pieces in the bundle", () => {
    expect(
      expectedOrdersFrom({ views: 10000, linkCtrPct: 1, orderConversionPct: 3, pieces: 3 })
    ).toBe(9);
  });

  it("is zero when any link in the chain is missing", () => {
    expect(expectedOrdersFrom({ views: 0, linkCtrPct: 1, orderConversionPct: 3 })).toBe(0);
    expect(expectedOrdersFrom({ views: 10000, linkCtrPct: 0, orderConversionPct: 3 })).toBe(0);
  });
});

describe("earningsForecast", () => {
  const tiers: CommissionTier[] = [
    { minOrders: 0, amount: 20 },
    { minOrders: 15, amount: 30 },
    { minOrders: 30, amount: 40 },
  ];

  it("tells a small channel which rungs it will never reach", () => {
    // Sigcruiser: ~923 views a video gives well under one order.
    const orders = expectedOrdersFrom({ views: 923, linkCtrPct: 1, orderConversionPct: 3, pieces: 3 });
    const f = earningsForecast({ expectedOrders: orders, commission: NO_COMMISSION, aov: 120, tiers });
    expect(f.orders).toBeLessThan(1);
    expect(f.unreachableTiers.map((t) => t.minOrders)).toEqual([15, 30]);
    expect(f.total).toBeLessThan(20);
  });

  it("counts a rung as reachable when a good run would get there", () => {
    // 6 expected orders — 15 is plausible on a strong video, 30 is not.
    const f = earningsForecast({ expectedOrders: 6, commission: NO_COMMISSION, aov: 120, tiers });
    expect(f.reachableTiers.map((t) => t.minOrders)).toEqual([0, 15]);
    expect(f.unreachableTiers.map((t) => t.minOrders)).toEqual([30]);
  });

  it("prices at the rate the expected volume actually earns", () => {
    const f = earningsForecast({ expectedOrders: 20, commission: NO_COMMISSION, aov: 120, tiers });
    expect(f.perOrder).toBe(30);
    expect(f.total).toBe(600);
  });

  it("falls back to the flat commission when no ladder is set", () => {
    const f = earningsForecast({
      expectedOrders: 10,
      commission: { type: "per_order", value: 25 },
      aov: 120,
    });
    expect(f.perOrder).toBe(25);
    expect(f.total).toBe(250);
  });
});
