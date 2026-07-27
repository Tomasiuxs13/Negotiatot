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
 * Commission comes off the top: every euro of expected CPA is a euro less of fee you
 * can afford. Clamped at zero — when commission alone exceeds the margin, the honest
 * answer is that there's no room for a fee at all, not a negative one.
 */
export function breakevenFee(params: {
  expectedOrders: number;
  economics: Economics;
  commission?: Commission;
}): number {
  const { expectedOrders, economics } = params;
  const commission = params.commission ?? NO_COMMISSION;
  if (expectedOrders <= 0) return 0;

  const profit = grossProfitPerOrder(economics) * expectedOrders;
  const cpa = expectedCommission(commission, economics.aov, expectedOrders);
  return Math.max(0, profit - cpa);
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

/** What the deal actually costs: the fee you agreed plus the CPA you expect to pay. */
export function trueDealCost(params: {
  fee: number;
  expectedOrders: number;
  aov: number;
  commission?: Commission;
}): { fee: number; commission: number; total: number } {
  const commission = expectedCommission(
    params.commission ?? NO_COMMISSION,
    params.aov,
    params.expectedOrders
  );
  return { fee: params.fee, commission, total: params.fee + commission };
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
