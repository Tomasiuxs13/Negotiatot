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

/** What one order costs you in commission. */
export function commissionPerOrder(commission: Commission, aov: number): number {
  if (commission.type === "none" || commission.value <= 0) return 0;
  if (commission.type === "percent") return aov * (commission.value / 100);
  return commission.value;
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
  /** What the gifted product costs YOU — cost of goods, not its retail price. */
  productCost?: number;
}): number {
  const { expectedOrders, economics } = params;
  const commission = params.commission ?? NO_COMMISSION;
  if (expectedOrders <= 0) return 0;

  const profit = grossProfitPerOrder(economics) * expectedOrders;
  const cpa = expectedCommission(commission, economics.aov, expectedOrders);
  return Math.max(0, profit - cpa - (params.productCost ?? 0));
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
  productCost?: number;
}): { fee: number; commission: number; product: number; total: number } {
  const commission = expectedCommission(
    params.commission ?? NO_COMMISSION,
    params.aov,
    params.expectedOrders
  );
  const product = params.productCost ?? 0;
  return { fee: params.fee, commission, product, total: params.fee + commission + product };
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

/** Plain-language form, for prompts and UI. */
export function describeCommission(commission: Commission): string {
  if (commission.type === "none" || commission.value <= 0) return "no commission";
  if (commission.type === "percent") return `${commission.value}% commission per sale`;
  return `€${commission.value} per order`;
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
