/**
 * Hybrid deals: a fixed fee plus a CPA/commission on what the content sells.
 *
 * The fee and the commission are the same budget. Paying 10% on every order doesn't
 * sit outside the deal price — it eats the margin the fixed fee is priced against, so
 * a fee that's fair at 0% commission is an overpay at 15%. Everything here exists to
 * make the fee *net* of what the performance side will cost.
 */

export type CommissionType = "none" | "percent" | "per_order";

export interface Commission {
  type: CommissionType;
  /** Percent of order value for "percent"; euros per order for "per_order". */
  value: number;
}

export const NO_COMMISSION: Commission = { type: "none", value: 0 };

export interface Economics {
  /** Average order value, in euros. */
  aov: number;
  /** Gross margin on that order, as a percent. */
  grossMarginPct: number;
  /** Lifetime uplift — a first order is worth more than its own margin. */
  repeatFactor?: number;
}

/** One rung of a volume ladder: from `minOrders` sales, each sale pays `amount`. */
export interface CommissionTier {
  minOrders: number;
  amount: number;
}

/**
 * The per-sale rate at a given volume.
 *
 * Modelled the way influencer affiliate programs usually run it: the volume reached
 * sets ONE rate that applies to every sale ("hit 50 and you're on €40"), rather than
 * progressive brackets where the first sales stay on the lower rate. That makes the
 * ladder a motivator — the creator's whole payout improves when they cross a rung —
 * which is the reason to offer tiers at all.
 */
export function rateForVolume(tiers: CommissionTier[], orders: number): number {
  const applicable = tiers
    .filter((t) => orders >= t.minOrders)
    .sort((a, b) => a.minOrders - b.minOrders)
    .at(-1);
  return applicable?.amount ?? 0;
}

/** Total CPA across a run of sales, using the rate the final volume earns. */
export function tieredCommission(tiers: CommissionTier[], orders: number): number {
  if (orders <= 0 || tiers.length === 0) return 0;
  return rateForVolume(tiers, orders) * orders;
}

/** The next rung up, and what reaching it is worth — the pitch to put in a draft. */
export function nextTier(
  tiers: CommissionTier[],
  orders: number
): { tier: CommissionTier; ordersAway: number; extraTotal: number } | null {
  const above = tiers
    .filter((t) => t.minOrders > orders)
    .sort((a, b) => a.minOrders - b.minOrders)[0];
  if (!above) return null;
  return {
    tier: above,
    ordersAway: above.minOrders - orders,
    // What their whole payout becomes at that rung, versus now.
    extraTotal: above.amount * above.minOrders - rateForVolume(tiers, orders) * orders,
  };
}

/**
 * Parses "50: 40" rungs from the Playbook into a sorted ladder.
 *
 * Rungs are accepted one per line or comma-separated on one line, with or without a
 * currency symbol. Being strict here was a silent failure: a ladder typed on a single
 * line parsed to nothing, and the unparsed text still reached the model, which read
 * "0:20, 15:30" as percentages and invented a commission structure from it.
 */
export function parseTiers(lines: string[]): CommissionTier[] {
  return lines
    .flatMap((line) => line.split(","))
    .map((entry) => {
      const [from, amount] = entry
        .split(":")
        .map((part) => Number(part.replace(/[€$£\s]/g, "").trim()));
      return Number.isFinite(from) && Number.isFinite(amount)
        ? { minOrders: from, amount }
        : null;
    })
    .filter((t): t is CommissionTier => t != null)
    .sort((a, b) => a.minOrders - b.minOrders);
}

/** Reads back as the Playbook stores it. */
export function describeTiers(tiers: CommissionTier[]): string {
  if (tiers.length === 0) return "no volume tiers";
  return tiers.map((t) => `€${t.amount}/sale from ${t.minOrders}`).join(", ");
}

export type DiscountType = "none" | "percent" | "fixed";

/** The offer the creator's audience gets — a coupon code, in percent or euros off. */
export interface Discount {
  type: DiscountType;
  value: number;
}

export const NO_DISCOUNT: Discount = { type: "none", value: 0 };

/**
 * What one order costs you in audience discount.
 *
 * A discount code isn't a marketing freebie: cost of goods doesn't change, so every
 * euro off the price is a euro straight off your margin — the same as paying it out.
 */
export function discountPerOrder(discount: Discount, aov: number): number {
  if (discount.type === "none" || discount.value <= 0) return 0;
  const off = discount.type === "percent" ? aov * (discount.value / 100) : discount.value;
  return Math.min(off, aov);
}

/**
 * What one order costs you in commission.
 *
 * A percentage is taken on what the customer actually paid — after any discount code —
 * because that's the figure affiliate networks settle on.
 */
export function commissionPerOrder(
  commission: Commission,
  aov: number,
  discount: Discount = NO_DISCOUNT
): number {
  if (commission.type === "none" || commission.value <= 0) return 0;
  if (commission.type === "per_order") return commission.value;
  const paid = aov - discountPerOrder(discount, aov);
  return paid * (commission.value / 100);
}

/** Everything the creator's audience and the creator cost you on a single order. */
export function offerCostPerOrder(params: {
  aov: number;
  commission?: Commission;
  discount?: Discount;
}): { discount: number; commission: number; total: number } {
  const discount = discountPerOrder(params.discount ?? NO_DISCOUNT, params.aov);
  const commission = commissionPerOrder(
    params.commission ?? NO_COMMISSION,
    params.aov,
    params.discount ?? NO_DISCOUNT
  );
  return { discount, commission, total: discount + commission };
}

/** What the performance side of the deal is expected to cost in total. */
export function expectedCommission(
  commission: Commission,
  aov: number,
  expectedOrders: number
): number {
  if (expectedOrders <= 0) return 0;
  return commissionPerOrder(commission, aov) * expectedOrders;
}

/** Gross profit one order leaves you, before any commission. */
export function grossProfitPerOrder(e: Economics): number {
  return e.aov * (e.grossMarginPct / 100) * (e.repeatFactor ?? 1);
}

/**
 * The most you can pay in *fixed fee* before the deal stops making money.
 *
 * Commission and gifted product both come off the top: every euro of expected CPA and
 * every euro of product cost is a euro less of fee you can afford. Clamped at zero —
 * when those alone exceed the margin, the honest answer is that there's no room for a
 * fee at all, not a negative one.
 */
export function breakevenFee(params: {
  expectedOrders: number;
  economics: Economics;
  commission?: Commission;
  /** Coupon the audience gets — its cost lands on you, not the creator. */
  discount?: Discount;
  /** What the gifted product costs YOU — cost of goods, not its retail price. */
  productCost?: number;
}): number {
  const { expectedOrders, economics } = params;
  if (expectedOrders <= 0) return 0;

  const profit = grossProfitPerOrder(economics) * expectedOrders;
  const perOrder = offerCostPerOrder({
    aov: economics.aov,
    commission: params.commission,
    discount: params.discount,
  });
  return Math.max(0, profit - perOrder.total * expectedOrders - (params.productCost ?? 0));
}

/**
 * How much a commission shrinks the affordable fee, in euros. This is the number the
 * fixed-fee negotiation has to move by — the "you're already earning on every sale"
 * argument, quantified.
 */
export function feeReduction(params: {
  expectedOrders: number;
  economics: Economics;
  commission: Commission;
}): number {
  const withNone = breakevenFee({ ...params, commission: NO_COMMISSION });
  const withCommission = breakevenFee(params);
  return Math.max(0, withNone - withCommission);
}

/**
 * What the deal actually costs: the fee, plus the CPA you expect to pay, plus the
 * product you gave away. A "free" product is only free to the creator.
 */
export function trueDealCost(params: {
  fee: number;
  expectedOrders: number;
  aov: number;
  commission?: Commission;
  discount?: Discount;
  productCost?: number;
}): {
  fee: number;
  commission: number;
  discount: number;
  product: number;
  total: number;
} {
  const perOrder = offerCostPerOrder({
    aov: params.aov,
    commission: params.commission,
    discount: params.discount,
  });
  const orders = Math.max(0, params.expectedOrders);
  const commission = perOrder.commission * orders;
  const discount = perOrder.discount * orders;
  const product = params.productCost ?? 0;
  return {
    fee: params.fee,
    commission,
    discount,
    product,
    total: params.fee + commission + discount + product,
  };
}

export type DealStructure = "paid" | "gifted_plus_commission" | "not_viable";

/**
 * Whether a fixed fee is worth paying at all.
 *
 * On a small channel the affordable fee can land at a number — €22 — where the admin
 * of a paid deal (contract, invoice, payment run, chasing) costs more than the fee
 * buys. Below that floor the sane structure is product plus commission: the creator
 * still earns, from sales rather than a token payment, and nobody processes a €22
 * invoice. With nothing left to give at all, the deal isn't viable.
 */
export function suggestStructure(params: {
  affordableFee: number;
  /** Smallest fee worth the paperwork. */
  minPaidFee: number;
  hasProduct: boolean;
  hasCommission: boolean;
}): { structure: DealStructure; reason: string } {
  const { affordableFee, minPaidFee, hasProduct, hasCommission } = params;

  if (affordableFee >= minPaidFee) {
    return { structure: "paid", reason: "The numbers support a fixed fee." };
  }
  if (hasProduct || hasCommission) {
    return {
      structure: "gifted_plus_commission",
      reason:
        `A fee of about €${Math.round(affordableFee)} costs more to administer than it's ` +
        `worth. Offer the product and commission instead — the creator still earns, from sales.`,
    };
  }
  return {
    structure: "not_viable",
    reason:
      `Nothing left to offer: no fee the economics support, no product, no commission. ` +
      `Walk away or find a cheaper ask.`,
  };
}

/** Plain-language form of the audience offer. */
export function describeDiscount(discount: Discount): string {
  if (discount.type === "none" || discount.value <= 0) return "no discount code";
  return discount.type === "percent"
    ? `${discount.value}% off for their audience`
    : `€${discount.value} off for their audience`;
}

/** Plain-language form, for prompts and UI. */
export function describeCommission(commission: Commission): string {
  if (commission.type === "none" || commission.value <= 0) return "no commission";
  if (commission.type === "percent") return `${commission.value}% commission per sale`;
  return `€${commission.value} per order`;
}

/**
 * The commission and discount actually in play: whatever the deal specifies, else the
 * Playbook's standard offer. Without this fallback a deal created before the fields
 * existed carried no commission at all, and the engine priced it as a flat-fee deal
 * while the Playbook said every creator earns per sale.
 */
export function resolveOffer(
  deal: {
    commission_type?: string | null;
    commission_value?: number | null;
    discount_type?: string | null;
    discount_value?: number | null;
  },
  econ: Record<string, number> = {}
): { commission: Commission; discount: Discount } {
  const dealCom = dealCommission(deal);
  const dealDisc = dealDiscount(deal);

  const fallbackCommission: Commission =
    econ.commissionPerOrder > 0
      ? { type: "per_order", value: econ.commissionPerOrder }
      : econ.commissionPercent > 0
        ? { type: "percent", value: econ.commissionPercent }
        : NO_COMMISSION;

  const fallbackDiscount: Discount =
    econ.discountFixed > 0
      ? { type: "fixed", value: econ.discountFixed }
      : econ.discountPercent > 0
        ? { type: "percent", value: econ.discountPercent }
        : NO_DISCOUNT;

  return {
    commission: dealCom.type === "none" ? fallbackCommission : dealCom,
    discount: dealDisc.type === "none" ? fallbackDiscount : dealDisc,
  };
}

/** Reads an audience discount off a deal row, tolerating the older schema. */
export function dealDiscount(deal: {
  discount_type?: string | null;
  discount_value?: number | null;
}): Discount {
  const type = deal.discount_type;
  if (type !== "percent" && type !== "fixed") return NO_DISCOUNT;
  return { type, value: deal.discount_value ?? 0 };
}

/** Reads a commission off a deal row, tolerating the pre-commission schema. */
export function dealCommission(deal: {
  commission_type?: string | null;
  commission_value?: number | null;
}): Commission {
  const type = deal.commission_type;
  if (type !== "percent" && type !== "per_order") return NO_COMMISSION;
  return { type, value: deal.commission_value ?? 0 };
}

/**
 * Orders a piece of content should drive, along the chain the Playbook defines:
 * views → clicks → orders. Computed here rather than asked of the model, so the
 * forecast is the same every run and can't drift into an invented assumption.
 */
export function expectedOrdersFrom(params: {
  views: number;
  linkCtrPct: number;
  orderConversionPct: number;
  pieces?: number;
}): number {
  const { views, linkCtrPct, orderConversionPct } = params;
  if (views <= 0 || linkCtrPct <= 0 || orderConversionPct <= 0) return 0;
  const perPiece = views * (linkCtrPct / 100) * (orderConversionPct / 100);
  return perPiece * Math.max(1, params.pieces ?? 1);
}

/**
 * What the creator should expect to earn, and whether the tiers above them are
 * realistically in reach.
 *
 * The reachability check matters: dangling "€40/sale once you pass 50" at a channel
 * that will drive two orders is a promise that reads well and pays nothing, which is
 * how a first collaboration becomes a last one.
 */
export function earningsForecast(params: {
  expectedOrders: number;
  commission: Commission;
  aov: number;
  discount?: Discount;
  tiers?: CommissionTier[];
}): {
  orders: number;
  perOrder: number;
  total: number;
  reachableTiers: CommissionTier[];
  unreachableTiers: CommissionTier[];
} {
  const orders = Math.max(0, params.expectedOrders);
  const tiers = params.tiers ?? [];

  // With a ladder configured, the rate follows the volume they're actually likely to do.
  const perOrder =
    tiers.length > 0
      ? rateForVolume(tiers, Math.floor(orders))
      : commissionPerOrder(params.commission, params.aov, params.discount ?? NO_DISCOUNT);

  // Allow some upside over the forecast before calling a rung out of reach.
  const withUpside = orders * 3;
  return {
    orders,
    perOrder,
    total: perOrder * orders,
    reachableTiers: tiers.filter((t) => t.minOrders <= withUpside),
    unreachableTiers: tiers.filter((t) => t.minOrders > withUpside),
  };
}
